import { describe, expect, it } from 'vitest';
import { analyse } from './analysis';
import { compareArms } from './criteria';
import { DEFAULT_MARKS, PROTOCOL, buildTimeline, stepAt, type SessionMeta } from './protocol';
import type { FrameRecord } from './types';

const F = 900; // px
const IPD = 63; // mm
const CX = 640;
const CY = 360;

/** Seeded so failures reproduce. */
function rng(seed: number) {
	return () => {
		seed = (seed * 1664525 + 1013904223) % 2 ** 32;
		return seed / 2 ** 32;
	};
}

/**
 * A head at the protocol's true positions, seen through an ideal mirrored pinhole camera.
 * lateArrival: fraction of the R calibration step spent still sliding over from C.
 */
function simulate(noisePx: number, seed = 1, lateArrival = 0): FrameRecord[] {
	const rand = rng(seed);
	const gauss = () => Math.sqrt(-2 * Math.log(rand() + 1e-12)) * Math.cos(2 * Math.PI * rand());
	const timeline = buildTimeline();
	const steps = new Map(PROTOCOL.map((s) => [s.id, s]));
	const records: FrameRecord[] = [];
	const end = timeline[timeline.length - 1].endMs;
	for (let t = 0; t < end; t += 1000 / 30) {
		const stepId = stepAt(timeline, t);
		const step = stepId ? steps.get(stepId) : undefined;
		const absent = step?.kind === 'absent';
		// During prep the participant is already at the upcoming step's mark.
		const upcoming = steps.get(timeline.find((s) => s.endMs > t)?.stepId ?? '');
		const truth = (step ?? upcoming)?.truth?.(DEFAULT_MARKS) ?? { x: 0, z: DEFAULT_MARKS.z0 };
		const seg = timeline.find((s) => s.stepId === stepId);
		const progress = seg ? (t - seg.startMs) / (seg.endMs - seg.startMs) : 1;
		const x =
			step?.kind === 'motion'
				? 150 * Math.sin((2 * Math.PI * t) / 1000)
				: stepId === 'calibLateral' && progress < lateArrival
					? truth.x * (progress / lateArrival)
					: truth.x;
		const z = truth.z;
		records.push({
			t,
			stepId,
			detected: !absent,
			procMs: 10 + rand() * 5,
			captureToResultMs: null,
			centres: absent
				? {}
				: { pointer: { x: CX - (F * x) / z + noisePx * gauss(), y: CY + noisePx * gauss() } },
			sizes: absent ? {} : { none: (F * IPD) / z }
		});
	}
	return records;
}

describe('analyse', () => {
	it('recovers true positions from noiseless data', () => {
		const { combos, stats } = analyse(simulate(0), 'pointer', DEFAULT_MARKS);
		const c = combos[0];
		expect(c.failure).toBeUndefined();
		expect(Math.abs(c.calibration!.f)).toBeCloseTo(F, 6);
		expect(c.calibration!.realSize).toBeCloseTo(IPD, 6);
		expect(c.accuracyMm).toBeLessThan(1e-6);
		expect(c.staticJitterRaw).toBeLessThan(1e-6);
		expect(stats.detectionRateNormal).toBe(1);
		expect(stats.recoveryMs).toBeLessThan(40);
	});

	it('measures jitter that matches injected noise and is reduced by the filter', () => {
		const { combos } = analyse(simulate(2), 'pointer', DEFAULT_MARKS);
		const c = combos[0];
		// 2 px at f=900, z=600-750 ≈ 1.3-1.7 mm per axis, 2 axes.
		expect(c.staticJitterRaw).toBeGreaterThan(1.5);
		expect(c.staticJitterRaw).toBeLessThan(3);
		expect(c.staticJitterFiltered).toBeLessThan(c.staticJitterRaw / 2);
		expect(c.accuracyMm).toBeLessThan(5);
		expect(c.filterLagMs).toBeGreaterThan(0);
	});

	it('calibrates from the settled part of the R step when the participant arrives late', () => {
		// Real sessions: still sliding towards R for most of the step. A whole-step median
		// would underestimate the lateral shift and skew every sideways distance.
		const { combos } = analyse(simulate(0, 1, 0.6), 'pointer', DEFAULT_MARKS);
		expect(Math.abs(combos[0].calibration!.f)).toBeCloseTo(F, 6);
	});
});

describe('compareArms', () => {
	const meta: SessionMeta = {
		participant: 'p1',
		lighting: 'normal',
		glasses: false,
		machine: 'test',
		notes: '',
		marks: DEFAULT_MARKS,
		recordedAt: ''
	};
	const session = (tracker: string, noise: number) => ({
		tracker,
		landmarkSet: 'pointer' as const,
		meta,
		source: 'replay' as const,
		droppedFrames: 0,
		filter: { minCutoff: 1, beta: 0.01, dCutoff: 1 },
		...analyse(simulate(noise), 'pointer', DEFAULT_MARKS)
	});

	it('ranks the less noisy arm first and applies gates', () => {
		const arms = compareArms([session('noisy', 8), session('clean', 1)]);
		expect(arms[0].tracker).toBe('clean');
		expect(arms[0].score).toBeGreaterThan(arms[1].score);
		expect(arms[0].gates.every((g) => g.pass)).toBe(true);
	});
});
