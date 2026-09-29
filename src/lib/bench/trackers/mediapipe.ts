import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { base } from '$app/paths';
import type { TrackFrame, Tracker } from '../types';

/** Arm B: MediaPipe Face Landmarker alone. Assets come from facialID-test/scripts/fetch-mediapipe.sh. */
export class MediaPipeTracker implements Tracker {
	readonly id = 'mediapipe';
	readonly label = 'B: MediaPipe Face Landmarker';
	readonly landmarkSet = 'mp478' as const;
	private landmarker: FaceLandmarker | null = null;

	constructor(private readonly delegate: 'GPU' | 'CPU' = 'GPU') {}

	/** Which delegate actually loaded; GPU falls back to CPU (e.g. headless, no WebGL). */
	delegateUsed: 'GPU' | 'CPU' | null = null;

	async init() {
		const fileset = await FilesetResolver.forVisionTasks(`${base}/mediapipe/wasm`);
		const create = (delegate: 'GPU' | 'CPU') =>
			FaceLandmarker.createFromOptions(fileset, {
				baseOptions: { modelAssetPath: `${base}/mediapipe/face_landmarker.task`, delegate },
				runningMode: 'VIDEO',
				numFaces: 1,
				outputFacialTransformationMatrixes: true
			});
		try {
			this.landmarker = await create(this.delegate);
			this.delegateUsed = this.delegate;
		} catch (e) {
			if (this.delegate === 'CPU') throw e;
			console.warn('MediaPipe GPU delegate failed, using CPU', e);
			this.landmarker = await create('CPU');
			this.delegateUsed = 'CPU';
		}
	}

	process(video: HTMLVideoElement, timestampMs: number): TrackFrame {
		if (!this.landmarker) throw new Error('MediaPipeTracker not initialised');
		const res = this.landmarker.detectForVideo(video, timestampMs);
		const lm = res.faceLandmarks[0];
		if (!lm) return { landmarks: null };
		const w = video.videoWidth;
		const h = video.videoHeight;
		// Matrix is 4x4 column-major; translation is the last column.
		const m = res.facialTransformationMatrixes[0]?.data;
		return {
			landmarks: lm.map((p) => ({ x: p.x * w, y: p.y * h })),
			pose: m ? { x: m[12], y: m[13], z: m[14] } : undefined
		};
	}

	dispose() {
		this.landmarker?.close();
		this.landmarker = null;
	}
}
