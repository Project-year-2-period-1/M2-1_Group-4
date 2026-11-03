import { ESTIMATORS, evaluateOptions, type EstimatorCombo } from './estimators';
import { calibrate, toMm, type Calibration, type CalibrationSample } from './geometry';
import { DEFAULT_ONE_EURO, OneEuro } from './oneEuro';
import type { Marks } from './protocol';
import { CAMERA } from './session';
import { median } from './stats';
import type { TrackFrame, Tracker, Vec2, Vec3 } from './types';

export interface LiveUpdate {
	frame: TrackFrame;
	/** First centre option in normalised image coords (0..1, mirrored like a selfie view). */
	normalised: Vec2 | null;
	/** Filtered head position in mm, once calibrated. */
	position: Vec3 | null;
	procMs: number;
}

/**
 * Runs a tracker on the webcam continuously for hands-on use (live view, blind test): no
 * protocol, quick two-mark calibration, filtered mm output for one chosen estimator.
 */
export class LiveTracker {
	combo: EstimatorCombo;
	calibration: Calibration | null = null;
	/** Inactive trackers skip frames, so a paused condition doesn't steal CPU. */
	active = true;
	private stream: MediaStream | null = null;
	private handle = 0;
	private running = false;
	private filters = [
		new OneEuro(DEFAULT_ONE_EURO),
		new OneEuro(DEFAULT_ONE_EURO),
		new OneEuro(DEFAULT_ONE_EURO)
	];
	private lastDetected = -Infinity;
	private capture: CalibrationSample[] | null = null;

	constructor(
		readonly tracker: Tracker,
		private readonly video: HTMLVideoElement,
		private readonly onUpdate: (u: LiveUpdate) => void
	) {
		const { centres, sizes } = ESTIMATORS[tracker.landmarkSet];
		this.combo = { centre: centres[0].id, size: sizes.find((s) => s.unit === centres[0].unit)!.id };
	}

	async start() {
		await this.tracker.init();
		// Several LiveTrackers can share one video; the first one opens the camera.
		if (!this.video.srcObject) {
			this.stream = await navigator.mediaDevices.getUserMedia(CAMERA);
			this.video.srcObject = this.stream;
			await this.video.play();
		}
		this.running = true;
		this.handle = this.video.requestVideoFrameCallback(this.onFrame);
	}

	setCombo(combo: EstimatorCombo) {
		this.combo = combo;
		this.calibration = null;
	}

	/** Averages ~durationMs of frames; call at mark C, then at mark R. */
	async sample(durationMs = 1500): Promise<CalibrationSample> {
		this.capture = [];
		await new Promise((r) => setTimeout(r, durationMs));
		const got = this.capture;
		this.capture = null;
		if (got.length < 5) throw new Error('Face not detected while sampling');
		return {
			centre: { x: median(got.map((s) => s.centre.x)), y: median(got.map((s) => s.centre.y)) },
			size: median(got.map((s) => s.size))
		};
	}

	calibrateFrom(atCentre: CalibrationSample, atLateral: CalibrationSample, marks: Marks) {
		this.calibration = calibrate(atCentre, atLateral, marks.z0, marks.dx);
	}

	private onFrame: VideoFrameRequestCallback = () => {
		if (!this.running) return;
		if (!this.active) {
			this.handle = this.video.requestVideoFrameCallback(this.onFrame);
			return;
		}
		const t = performance.now();
		const frame = this.tracker.process(this.video, t);
		const procMs = performance.now() - t;
		const { centres, sizes } = evaluateOptions(this.tracker.landmarkSet, frame);
		const centre = centres[this.combo.centre];
		const size = sizes[this.combo.size];

		let position: Vec3 | null = null;
		let normalised: Vec2 | null = null;
		if (centre && size !== undefined) {
			this.capture?.push({ centre, size });
			const unit = ESTIMATORS[this.tracker.landmarkSet].centres.find(
				(c) => c.id === this.combo.centre
			)?.unit;
			if (unit === 'px')
				normalised = {
					x: 1 - centre.x / this.video.videoWidth,
					y: centre.y / this.video.videoHeight
				};
			if (this.calibration) {
				if (t - this.lastDetected > 250) this.filters.forEach((f) => f.reset());
				const raw = toMm(this.calibration, centre, size);
				const [fx, fy, fz] = this.filters;
				position = { x: fx.filter(raw.x, t), y: fy.filter(raw.y, t), z: fz.filter(raw.z, t) };
			}
			this.lastDetected = t;
		}
		this.onUpdate({ frame, normalised, position, procMs });
		this.handle = this.video.requestVideoFrameCallback(this.onFrame);
	};

	stop() {
		this.running = false;
		this.video.cancelVideoFrameCallback(this.handle);
		if (this.stream) {
			this.stream.getTracks().forEach((t) => t.stop());
			this.video.srcObject = null;
		}
		this.tracker.dispose();
	}
}
