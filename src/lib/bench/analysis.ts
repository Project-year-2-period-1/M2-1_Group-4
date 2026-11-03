import { comboKey, combosFor, type EstimatorCombo } from './estimators';
import { calibrate, toMm, type Calibration } from './geometry';
import { DEFAULT_ONE_EURO, OneEuro, type OneEuroParams } from './oneEuro';
import { PROTOCOL, type Marks, type SessionMeta, type Step } from './protocol';
import { crossCorrelationLag, mean, median, quantile, rmsSpread } from './stats';
import type { FrameRecord, LandmarkSetId, Vec3 } from './types';

/** Filter state resets after a detection gap longer than this. */
const GAP_RESET_MS = 250;

export interface StepResult {
	stepId: string;
	frames: number;
	detectionRate: number;
	/** RMS spread about the step mean, mm. */
	jitterRaw: number;
	jitterFiltered: number;
	/** |mean - truth| in the desk (x-z) plane, mm; null for steps without a known position. */
	error: number | null;
	errorX: number | null;
	errorZ: number | null;
}

export interface ComboResult {
	combo: string;
	calibration: Calibration | null;
	failure?: string;
	steps: StepResult[];
	/** Median filtered jitter over calibration + static steps. */
	staticJitterRaw: number;
	staticJitterFiltered: number;
	/** Mean error over static steps with a known position (calibration steps excluded: fit data). */
	accuracyMm: number;
	expressionDriftMm: number;
	rotationCouplingMm: number;
	filterLagMs: number;
}

export interface TrackerStats {
	frames: number;
	detectionRate: number;
	/** Detection rate over the steps where a face is in normal view. */
	detectionRateNormal: number;
	occlusionDetectionRate: number;
	/** First detection after the `return` step starts, ms. Null if never re-detected. */
	recoveryMs: number | null;
	procP50: number;
	procP95: number;
	captureToResultP50: number | null;
	fps: number;
}

export interface SessionResult {
	tracker: string;
	landmarkSet: LandmarkSetId;
	meta: SessionMeta;
	source: 'live' | 'replay';
	droppedFrames: number;
	stats: TrackerStats;
	combos: ComboResult[];
	filter: OneEuroParams;
}

const NORMAL_VIEW = new Set(['calibration', 'static', 'expression', 'rotation', 'motion']);

export function analyse(
	records: FrameRecord[],
	set: LandmarkSetId,
	marks: Marks,
	filter: OneEuroParams = DEFAULT_ONE_EURO,
	steps: Step[] = PROTOCOL
): { stats: TrackerStats; combos: ComboResult[] } {
	return {
		stats: trackerStats(records, steps),
		combos: combosFor(set).map((c) => analyseCombo(records, c, marks, filter, steps))
	};
}

function trackerStats(records: FrameRecord[], steps: Step[]): TrackerStats {
	const kind = new Map(steps.map((s) => [s.id, s.kind]));
	const rate = (rs: FrameRecord[]) =>
		rs.length ? rs.filter((r) => r.detected).length / rs.length : NaN;
	const inKinds = (ks: Set<string>) =>
		records.filter((r) => r.stepId && ks.has(kind.get(r.stepId)!));

	const ret = records.filter((r) => r.stepId === 'return');
	const firstBack = ret.find((r) => r.detected);
	const proc = records.map((r) => r.procMs);
	const c2r = records.flatMap((r) => (r.captureToResultMs == null ? [] : [r.captureToResultMs]));
	const duration = records.length > 1 ? records[records.length - 1].t - records[0].t : 0;

	return {
		frames: records.length,
		detectionRate: rate(records.filter((r) => r.stepId)),
		detectionRateNormal: rate(inKinds(NORMAL_VIEW)),
		occlusionDetectionRate: rate(inKinds(new Set(['occlusion']))),
		recoveryMs: firstBack && ret.length ? firstBack.t - ret[0].t : null,
		procP50: median(proc),
		procP95: quantile(proc, 0.95),
		captureToResultP50: c2r.length ? median(c2r) : null,
		fps: duration > 0 ? ((records.length - 1) * 1000) / duration : NaN
	};
}

function analyseCombo(
	records: FrameRecord[],
	combo: EstimatorCombo,
	marks: Marks,
	params: OneEuroParams,
	steps: Step[]
): ComboResult {
	const key = comboKey(combo);
	const empty: ComboResult = {
		combo: key,
		calibration: null,
		steps: [],
		staticJitterRaw: NaN,
		staticJitterFiltered: NaN,
		accuracyMm: NaN,
		expressionDriftMm: NaN,
		rotationCouplingMm: NaN,
		filterLagMs: NaN
	};

	const usable = (r: FrameRecord) =>
		r.detected && r.centres[combo.centre] !== undefined && r.sizes[combo.size] !== undefined;
	// Calibration uses only the second half of its step: in real sessions people were still
	// sliding into position at R well after recording started.
	const sample = (stepId: string) => {
		const inStep = records.filter((r) => r.stepId === stepId);
		if (!inStep.length) return null;
		const settled = (inStep[0].t + inStep[inStep.length - 1].t) / 2;
		const rs = inStep.filter((r) => r.t >= settled && usable(r));
		if (!rs.length) return null;
		return {
			centre: {
				x: median(rs.map((r) => r.centres[combo.centre].x)),
				y: median(rs.map((r) => r.centres[combo.centre].y))
			},
			size: median(rs.map((r) => r.sizes[combo.size]))
		};
	};

	const c = sample('calibCentre');
	const l = sample('calibLateral');
	if (!c || !l) return { ...empty, failure: 'No detections during calibration' };
	let cal: Calibration;
	try {
		cal = calibrate(c, l, marks.z0, marks.dx);
	} catch (e) {
		return { ...empty, failure: (e as Error).message };
	}

	// Raw and filtered position per usable frame.
	const fx = new OneEuro(params);
	const fy = new OneEuro(params);
	const fz = new OneEuro(params);
	let lastT = -Infinity;
	const pos: { r: FrameRecord; raw: Vec3; filt: Vec3 }[] = [];
	for (const r of records) {
		if (!usable(r)) continue;
		if (r.t - lastT > GAP_RESET_MS) [fx, fy, fz].forEach((f) => f.reset());
		lastT = r.t;
		const raw = toMm(cal, r.centres[combo.centre], r.sizes[combo.size]);
		pos.push({
			r,
			raw,
			filt: { x: fx.filter(raw.x, r.t), y: fy.filter(raw.y, r.t), z: fz.filter(raw.z, r.t) }
		});
	}

	const stepResults: StepResult[] = steps.map((s) => {
		const all = records.filter((r) => r.stepId === s.id);
		const ps = pos.filter((p) => p.r.stepId === s.id);
		const truth = s.truth?.(marks);
		const m = ps.length ? mean(ps.map((p) => p.raw.x)) : NaN;
		const mz = ps.length ? mean(ps.map((p) => p.raw.z)) : NaN;
		const ex = truth && ps.length ? m - truth.x : null;
		const ez = truth && ps.length ? mz - truth.z : null;
		return {
			stepId: s.id,
			frames: all.length,
			detectionRate: all.length ? ps.length / all.length : NaN,
			jitterRaw: ps.length > 1 ? rmsSpread(ps.map((p) => p.raw)).total : NaN,
			jitterFiltered: ps.length > 1 ? rmsSpread(ps.map((p) => p.filt)).total : NaN,
			error: ex != null && ez != null ? Math.hypot(ex, ez) : null,
			errorX: ex,
			errorZ: ez
		};
	});

	const kind = new Map(steps.map((s) => [s.id, s.kind]));
	const ofKind = (...ks: string[]) => stepResults.filter((s) => ks.includes(kind.get(s.stepId)!));
	const finite = (xs: number[]) => xs.filter(Number.isFinite);

	const motion = pos.filter((p) => p.r.stepId === 'motion');
	return {
		combo: key,
		calibration: cal,
		steps: stepResults,
		staticJitterRaw: median(finite(ofKind('calibration', 'static').map((s) => s.jitterRaw))),
		staticJitterFiltered: median(
			finite(ofKind('calibration', 'static').map((s) => s.jitterFiltered))
		),
		accuracyMm: mean(finite(ofKind('static').map((s) => s.error ?? NaN))),
		expressionDriftMm: mean(finite(ofKind('expression').map((s) => s.jitterFiltered))),
		rotationCouplingMm: mean(finite(ofKind('rotation').map((s) => s.jitterFiltered))),
		filterLagMs: crossCorrelationLag(
			motion.map((p) => p.r.t),
			motion.map((p) => p.raw.x),
			motion.map((p) => p.filt.x)
		)
	};
}
