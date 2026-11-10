import { describe, expect, it } from 'vitest';
import type { TrackFrame, Vec2 } from '$lib/bench/types';
import { IrisDistanceCalculator } from './irisDistanceCalculator';

function frameWithIrisDiameters(left: number, right: number): TrackFrame {
	const landmarks: Vec2[] = Array.from({ length: 478 }, () => ({ x: 0, y: 0 }));
	landmarks[469] = { x: 0, y: 0 };
	landmarks[471] = { x: left, y: 0 };
	landmarks[474] = { x: 0, y: 0 };
	landmarks[476] = { x: right, y: 0 };
	return { landmarks };
}

describe('IrisDistanceCalculator', () => {
	it('calculates Z distance in centimetres from both iris diameters', () => {
		const calculator = new IrisDistanceCalculator();
		const frame = frameWithIrisDiameters(12, 8);
		const distance = calculator.calculateZDistanceCm(frame, 1280);
		const focalLengthPx = 1280 / (2 * Math.tan((63 * Math.PI) / 360));

		expect(distance).toBeCloseTo((focalLengthPx * 11.7) / 100);
	});

	it('returns null when no usable iris landmarks are present', () => {
		const calculator = new IrisDistanceCalculator();

		expect(calculator.calculateZDistanceCm({ landmarks: null }, 1280)).toBeNull();
		expect(calculator.calculateZDistanceCm({ landmarks: [] }, 1280)).toBeNull();
		expect(calculator.calculateZDistanceCm(frameWithIrisDiameters(0, 0), 1280)).toBeNull();
	});
});
