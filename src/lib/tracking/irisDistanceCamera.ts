import { CAMERA } from '$lib/bench/session';
import { MediaPipeTracker } from '$lib/bench/trackers/mediapipe';
import { IrisDistanceCalculator } from './irisDistanceCalculator';

export class IrisDistanceCamera {
	private readonly tracker = new MediaPipeTracker();
	private readonly calculator = new IrisDistanceCalculator();
	private stream: MediaStream | null = null;
	private frameHandle = 0;
	private running = false;
	private stopped = false;

	constructor(
		private readonly video: HTMLVideoElement,
		private readonly onDistance: (distanceCm: number | null, error?: string) => void
	) {}

	async start() {
		this.stopped = false;
		try {
			await this.tracker.init();
			if (this.stopped) return this.tracker.dispose();
			const stream = await navigator.mediaDevices.getUserMedia(CAMERA);
			if (this.stopped) return stream.getTracks().forEach((track) => track.stop());
			this.stream = stream;
			this.video.srcObject = stream;
			await this.video.play();
			if (this.stopped) return;
		} catch (error) {
			if (!this.stopped) this.onDistance(null, this.errorMessage(error));
			this.stop();
			return;
		}

		this.running = true;
		this.frameHandle = this.video.requestVideoFrameCallback(this.onFrame);
	}

	private onFrame: VideoFrameRequestCallback = () => {
		if (!this.running) return;
		try {
			const frame = this.tracker.process(this.video, performance.now());
			this.onDistance(this.calculator.calculateZDistanceCm(frame, this.video.videoWidth));
			this.frameHandle = this.video.requestVideoFrameCallback(this.onFrame);
		} catch (error) {
			this.onDistance(null, this.errorMessage(error));
			this.stop();
		}
	};

	private errorMessage(error: unknown) {
		return error instanceof Error ? error.message : String(error);
	}

	stop() {
		this.stopped = true;
		this.running = false;
		if (this.frameHandle) this.video.cancelVideoFrameCallback(this.frameHandle);
		this.stream?.getTracks().forEach((track) => track.stop());
		this.stream = null;
		this.video.srcObject = null;
		this.tracker.dispose();
	}
}
