import { describe, expect, it } from 'vitest';
import { OneEuro } from './oneEuro';
import { crossCorrelationLag, quantile, rmsSpread } from './stats';

describe('stats', () => {
	it('quantile interpolates', () => {
		expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
		expect(quantile([5, 1, 3], 1)).toBe(5);
	});

	it('rmsSpread is the RMS distance from the mean', () => {
		const s = rmsSpread([
			{ x: -1, y: 0, z: 0 },
			{ x: 1, y: 0, z: 0 }
		]);
		expect(s.x).toBe(1);
		expect(s.total).toBe(1);
	});

	it('crossCorrelationLag finds a known delay on irregular timestamps', () => {
		const t: number[] = [];
		for (let x = 0; x < 4000; x += 30 + (x % 7)) t.push(x);
		const sig = (x: number) => Math.sin(x / 150) + 0.5 * Math.sin(x / 47);
		const lag = crossCorrelationLag(
			t,
			t.map(sig),
			t.map((x) => sig(x - 80))
		);
		expect(lag).toBeGreaterThanOrEqual(75);
		expect(lag).toBeLessThanOrEqual(85);
	});
});

describe('OneEuro', () => {
	it('passes a constant through and smooths alternating noise', () => {
		const f = new OneEuro();
		let out = 0;
		for (let i = 0; i < 100; i++) out = f.filter(10 + (i % 2 ? 1 : -1), i * 33);
		expect(Math.abs(out - 10)).toBeLessThan(0.3);
	});
});
