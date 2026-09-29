import type { SessionResult } from './analysis';
import { median } from './stats';

/**
 * PRE-REGISTRATION. Agree these numbers as a group and commit them BEFORE collecting data;
 * git history is the proof they were fixed in advance. Changing them after seeing results
 * defeats the point.
 *
 * Reference geometry for the reasoning below: eyes ~600 mm from a laptop screen with
 * ~0.18 mm pixels, scene depth up to 400 mm behind the screen. A point at depth d behind
 * the screen moves on screen by (eye movement) x d / (600 + d), i.e. up to 0.4x for the back
 * of the scene. So 1 mm of tracking error is ~2 px of on-screen movement at the back.
 */
export const CRITERIA = {
	/** Set to e.g. '2026-10-01, agreed by <names>' in the commit that fixes the numbers. */
	agreedOn: null as string | null,

	/** Hard gates: failing any one eliminates an arm, regardless of score. */
	gates: {
		/**
		 * The webcam delivers a frame every 33 ms. Slower than that and frames are dropped and
		 * lag grows. Everything is recorded and replayed on one computer (the one the project
		 * is tested and demoed on), so this holds for that machine only.
		 */
		maxProcP95Ms: 33,
		/** Losing the face 1 frame in 20 already shows as visible freezes/jumps. */
		minDetectionRateNormal: 0.95,
		/**
		 * Filtered RMS while holding still, best estimator of the arm. 2 mm ≈ 4 px of shimmer at
		 * the back of the scene: beyond that the scene visibly swims when you sit still.
		 */
		maxStaticJitterMm: 2,
		/**
		 * Mean error at the known marks. A consistent error only distorts the perspective
		 * mildly, so this is loose: 30 mm = 5% of the viewing distance.
		 */
		maxAccuracyMm: 30
	},

	/**
	 * Scored metrics, lower is better for all. Each arm scores best/value per metric (1 = best
	 * arm), weighted and summed. Weights add to 1. Ranked by how much each breaks the illusion:
	 */
	weights: {
		/** Visible shimmer at rest is the most noticed failure of head-coupled displays. */
		staticJitterFiltered: 0.25,
		/** Speed = responsiveness; also headroom for rendering. */
		procP95: 0.15,
		/** People turn their heads constantly while looking; that must not read as moving. */
		rotationCouplingMm: 0.15,
		/** Mild distortion only, and calibration partly absorbs it. */
		accuracyMm: 0.15,
		/** Talking, smiling, blinking while watching. */
		expressionDriftMm: 0.1,
		/** 1 - occlusion detection rate (hand on chin, drinking). */
		occlusionMissRate: 0.1,
		/** Time to pick the face up again after leaving the frame. */
		recoveryMs: 0.1
	},
	// Not scored: filter lag mostly reflects the shared filter, and end-to-end latency is
	// measured by hand (see `manual`).

	decision: {
		/**
		 * Fewer sessions per arm than this = not enough data to decide. Sessions can be
		 * different people at the same computer and/or different conditions (lighting,
		 * glasses); different faces make the result more trustworthy than repeats of one.
		 */
		minSessionsPerArm: 6,
		/**
		 * Scores closer than this count as a tie. A tie is broken by the blind test: the arm
		 * preferred in the majority of all blind trials wins.
		 */
		tieMargin: 0.05
	},

	/** Checked by hand, not by compareArms. */
	manual: {
		/**
		 * End-to-end latency from slow-motion video, minus the mouse-control floor. Commonly
		 * cited as the point where head-coupled motion starts feeling detached.
		 */
		maxAddedLatencyMs: 100
	}
};

type Metric = keyof typeof CRITERIA.weights;

export interface ArmSummary {
	tracker: string;
	sessions: number;
	/** Estimator with the lowest median filtered static jitter; the arm is judged on it. */
	bestCombo: string;
	metrics: Record<Metric, number>;
	gates: { name: string; value: number; limit: number; pass: boolean }[];
	score: number;
}

/** Median across sessions (participants x conditions) per arm, then gates and weighted score. */
export function compareArms(results: SessionResult[]): ArmSummary[] {
	// The mouse control is not a candidate.
	const byTracker = Map.groupBy(
		results.filter((r) => r.tracker !== 'pointer'),
		(r) => r.tracker
	);
	const arms = [...byTracker].map(([tracker, rs]) => summariseArm(tracker, rs));

	for (const k of Object.keys(CRITERIA.weights) as Metric[]) {
		const best = Math.min(...arms.map((a) => a.metrics[k]).filter(Number.isFinite));
		for (const a of arms) {
			const v = a.metrics[k];
			// Guard against a perfect 0 (e.g. no occlusion misses): everyone at 0 scores 1.
			const s = !Number.isFinite(v) ? 0 : v <= 0 ? 1 : best <= 0 ? 0 : best / v;
			a.score += CRITERIA.weights[k] * s;
		}
	}
	return arms.sort((a, b) => b.score - a.score);
}

function summariseArm(tracker: string, rs: SessionResult[]): ArmSummary {
	const combos = [...new Set(rs.flatMap((r) => r.combos.map((c) => c.combo)))];
	const comboMedian = (
		combo: string,
		k: 'staticJitterFiltered' | 'accuracyMm' | 'expressionDriftMm' | 'rotationCouplingMm'
	) =>
		median(
			rs
				.flatMap((r) => r.combos.filter((c) => c.combo === combo).map((c) => c[k]))
				.filter(Number.isFinite)
		);
	const bestCombo =
		combos
			.map((c) => ({ c, j: comboMedian(c, 'staticJitterFiltered') }))
			.filter((x) => Number.isFinite(x.j))
			.sort((a, b) => a.j - b.j)[0]?.c ?? '';

	const stat = (f: (r: SessionResult) => number | null) =>
		median(rs.map(f).filter((v): v is number => v != null && Number.isFinite(v)));

	const metrics: Record<Metric, number> = {
		staticJitterFiltered: comboMedian(bestCombo, 'staticJitterFiltered'),
		accuracyMm: comboMedian(bestCombo, 'accuracyMm'),
		expressionDriftMm: comboMedian(bestCombo, 'expressionDriftMm'),
		rotationCouplingMm: comboMedian(bestCombo, 'rotationCouplingMm'),
		procP95: stat((r) => r.stats.procP95),
		occlusionMissRate: stat((r) => 1 - r.stats.occlusionDetectionRate),
		recoveryMs: stat((r) => r.stats.recoveryMs)
	};

	const g = CRITERIA.gates;
	const detection = stat((r) => r.stats.detectionRateNormal);
	return {
		tracker,
		sessions: rs.length,
		bestCombo,
		metrics,
		gates: [
			{
				name: 'p95 processing ms ≤',
				value: metrics.procP95,
				limit: g.maxProcP95Ms,
				pass: metrics.procP95 <= g.maxProcP95Ms
			},
			{
				name: 'detection rate (normal view) ≥',
				value: detection,
				limit: g.minDetectionRateNormal,
				pass: detection >= g.minDetectionRateNormal
			},
			{
				name: 'static jitter mm ≤',
				value: metrics.staticJitterFiltered,
				limit: g.maxStaticJitterMm,
				pass: metrics.staticJitterFiltered <= g.maxStaticJitterMm
			},
			{
				name: 'accuracy mm ≤',
				value: metrics.accuracyMm,
				limit: g.maxAccuracyMm,
				pass: metrics.accuracyMm <= g.maxAccuracyMm
			}
		],
		score: 0
	};
}
