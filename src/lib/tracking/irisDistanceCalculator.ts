import type { TrackFrame, Vec2 } from '$lib/bench/types';

const IRIS_DIAMETER_MM = 11.7;
const CAMERA_HORIZONTAL_FOV_DEGREES = 63;
const DISTANCE_SAMPLE_COUNT = 5;

export class IrisDistanceCalculator {
	private samples: number[] = [];

	calculateZDistanceCm(frame: TrackFrame, frameWidth: number): number | null {
		const points = frame.landmarks;
		if (!points || points.length < 477 || !Number.isFinite(frameWidth) || frameWidth <= 0) {
			this.samples = [];
			return null;
		}

		const leftDiameter = this.distance(points[469], points[471]);
		const rightDiameter = this.distance(points[474], points[476]);
		const irisDiameterPx = (leftDiameter + rightDiameter) / 2;
		if (!Number.isFinite(irisDiameterPx) || irisDiameterPx <= 0) {
			this.samples = [];
			return null;
		}

		const focalLengthPx =
			frameWidth / (2 * Math.tan((CAMERA_HORIZONTAL_FOV_DEGREES * Math.PI) / 360));
		const distanceCm = (focalLengthPx * IRIS_DIAMETER_MM) / irisDiameterPx / 10;
		if (!Number.isFinite(distanceCm) || distanceCm <= 0) {
			this.samples = [];
			return null;
		}

		this.samples.push(distanceCm);
		if (this.samples.length > DISTANCE_SAMPLE_COUNT) this.samples.shift();
		return this.median(this.samples);
	}

	private distance(a: Vec2, b: Vec2) {
		return Math.hypot(a.x - b.x, a.y - b.y);
	}

	private median(values: number[]) {
		const sorted = [...values].sort((a, b) => a - b);
		return sorted[Math.floor(sorted.length / 2)];
	}
}
