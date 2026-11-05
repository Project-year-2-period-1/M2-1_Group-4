import { DEFAULT_ONE_EURO, OneEuro } from '$lib/bench/oneEuro';
import type { ScreenGeometry } from '$lib/bench/parallax';
import { CAMERA } from '$lib/bench/session';
import { median } from '$lib/bench/stats';
import { MediaPipeTracker } from '$lib/bench/trackers/mediapipe';
import type { Vec3 } from '$lib/bench/types';

/**
 * Placeholder setup until the real screen can be measured: a 24" 16:9 computer monitor with
 * the webcam in the middle of the screen. Most real webcams sit on the top edge, which would
 * be cameraOffset.y ≈ height / 2 + 10.
 */
export const ASSUMED_SCREEN: ScreenGeometry = {
	width: 531,
	height: 299,
	cameraOffset: { x: 0, y: 0 }
};

export type HeadTrackerStatus =
	| { state: 'loading' }
	| { state: 'measuring' }
	| { state: 'tracking'; baselineDistance: number }
	| { state: 'error'; message: string };

/** How long the viewer's starting distance is averaged over, once a face is seen. */
const BASELINE_MS = 1000;
/** A gap longer than this restarts the filters instead of smoothing across the jump. */
const LOST_MS = 250;

/**
 * Tracks the viewer's head with MediaPipe's facial transformation matrix (the bench's
 * winner, see facialID-test/README.md) and reports it in screen space: mm, origin at the
 * screen centre, x right and y up as the viewer sees it, z = distance towards the viewer.
 *
 * On start (and on recalibrate) it measures the viewer's starting distance, so the scene can
 * be scaled to whatever distance the viewer actually sits at.
 */
export class HeadTracker {
	/** Latest filtered head position, or null before the first detection. */
	position: Vec3 | null = null;
	/** Median distance (mm) over the first second of tracking. */
	baselineDistance: number | null = null;

	private readonly tracker = new MediaPipeTracker();
	private stream: MediaStream | null = null;
	private handle = 0;
	private running = false;
	/** Set by stop(), so a start() still loading doesn't turn the camera on afterwards. */
	private stopped = false;
	private filters = [0, 1, 2].map(() => new OneEuro(DEFAULT_ONE_EURO));
	private lastDetected = -Infinity;
	private baselineSamples: { t: number; z: number }[] = [];

	constructor(
		private readonly video: HTMLVideoElement,
		private readonly onStatus: (s: HeadTrackerStatus) => void,
		readonly screen: ScreenGeometry = ASSUMED_SCREEN
	) {}

	async start() {
		this.onStatus({ state: 'loading' });
		try {
			await this.tracker.init();
			if (this.stopped) return this.tracker.dispose();
			const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
			if (this.stopped) return stream.getTracks().forEach((t) => t.stop());
			this.stream = stream;
			this.video.srcObject = stream;
			await this.video.play();
			if (this.stopped) return;
		} catch (e) {
			if (this.stopped) return;
			this.onStatus({ state: 'error', message: (e as Error).message });
			this.stop();
			return;
		}
		this.running = true;
		this.recalibrate();
		this.handle = this.video.requestVideoFrameCallback(this.onFrame);
	}

	/** Forget the starting distance and measure it again. */
	recalibrate() {
		this.baselineDistance = null;
		this.baselineSamples = [];
		this.onStatus({ state: 'measuring' });
	}

	private onFrame: VideoFrameRequestCallback = () => {
		if (!this.running) return;
		const t = performance.now();
		const pose = this.tracker.process(this.video, t).pose;
		if (pose) {
			// MediaPipe's pose is in cm, in an OpenGL camera looking at the viewer (-Z forward)
			// on the unmirrored feed, so the viewer's right is the camera's -x.
			const raw = {
				x: -pose.x * 10 + this.screen.cameraOffset.x,
				y: pose.y * 10 + this.screen.cameraOffset.y,
				z: -pose.z * 10
			};
			if (t - this.lastDetected > LOST_MS) this.filters.forEach((f) => f.reset());
			this.lastDetected = t;
			const [fx, fy, fz] = this.filters;
			this.position = { x: fx.filter(raw.x, t), y: fy.filter(raw.y, t), z: fz.filter(raw.z, t) };
			if (this.baselineDistance === null) this.measureBaseline(t, raw.z);
		} else {
			// only measure the starting distance over an unbroken stretch of detections
			this.baselineSamples = [];
		}
		this.handle = this.video.requestVideoFrameCallback(this.onFrame);
	};

	private measureBaseline(t: number, z: number) {
		this.baselineSamples.push({ t, z });
		if (t - this.baselineSamples[0].t < BASELINE_MS || this.baselineSamples.length < 10) return;
		this.baselineDistance = median(this.baselineSamples.map((s) => s.z));
		this.baselineSamples = [];
		this.onStatus({ state: 'tracking', baselineDistance: this.baselineDistance });
	}

	stop() {
		this.stopped = true;
		this.running = false;
		this.video.cancelVideoFrameCallback(this.handle);
		this.stream?.getTracks().forEach((t) => t.stop());
		this.stream = null;
		this.video.srcObject = null;
		this.tracker.dispose();
	}
}
