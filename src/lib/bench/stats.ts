import type { Vec3 } from './types';

export const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

export function median(xs: number[]): number {
	return quantile(xs, 0.5);
}

/** Linear-interpolated quantile, q in [0, 1]. */
export function quantile(xs: number[], q: number): number {
	if (xs.length === 0) return NaN;
	const s = [...xs].sort((a, b) => a - b);
	const pos = (s.length - 1) * q;
	const lo = Math.floor(pos);
	const hi = Math.ceil(pos);
	return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

export function meanVec(ps: Vec3[]): Vec3 {
	return { x: mean(ps.map((p) => p.x)), y: mean(ps.map((p) => p.y)), z: mean(ps.map((p) => p.z)) };
}

/** Per-axis and 3D RMS distance from the mean: the jitter/precision measure. */
export function rmsSpread(ps: Vec3[]) {
	const m = meanVec(ps);
	const axis = (k: keyof Vec3) => Math.sqrt(mean(ps.map((p) => (p[k] - m[k]) ** 2)));
	return {
		x: axis('x'),
		y: axis('y'),
		z: axis('z'),
		total: Math.sqrt(mean(ps.map((p) => (p.x - m.x) ** 2 + (p.y - m.y) ** 2 + (p.z - m.z) ** 2)))
	};
}

/**
 * Lag (ms) of `b` behind `a`: the shift maximising their correlation. Both are resampled onto
 * a uniform grid first, since tracker frame times are irregular. Positive = b is late.
 */
export function crossCorrelationLag(
	t: number[],
	a: number[],
	b: number[],
	maxLagMs = 500,
	stepMs = 5
): number {
	if (t.length < 2) return NaN;
	const grid: number[] = [];
	for (let x = t[0]; x <= t[t.length - 1]; x += stepMs) grid.push(x);
	const ra = resample(t, a, grid);
	const rb = resample(t, b, grid);
	const ma = mean(ra);
	const mb = mean(rb);
	let best = 0;
	let bestScore = -Infinity;
	for (let lag = 0; lag * stepMs <= maxLagMs; lag++) {
		let s = 0;
		for (let i = 0; i + lag < grid.length; i++) s += (ra[i] - ma) * (rb[i + lag] - mb);
		s /= grid.length - lag;
		if (s > bestScore) {
			bestScore = s;
			best = lag;
		}
	}
	return best * stepMs;
}

function resample(t: number[], v: number[], grid: number[]): number[] {
	const out: number[] = [];
	let j = 0;
	for (const g of grid) {
		while (j < t.length - 2 && t[j + 1] < g) j++;
		const span = t[j + 1] - t[j];
		const w = span > 0 ? Math.min(1, Math.max(0, (g - t[j]) / span)) : 0;
		out.push(v[j] + (v[j + 1] - v[j]) * w);
	}
	return out;
}
