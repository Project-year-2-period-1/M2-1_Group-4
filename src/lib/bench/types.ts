export interface Vec2 {
	x: number;
	y: number;
}

export interface Vec3 {
	x: number;
	y: number;
	z: number;
}

/** Which landmark layout a tracker emits; estimators are defined per layout. */
export type LandmarkSetId = 'mp478' | 'ibug68' | 'pointer';

export interface TrackFrame {
	/** Landmarks in source-image pixels, or null when no face was found. */
	landmarks: Vec2[] | null;
	/**
	 * Tracker-native head translation, if the tracker has one (MediaPipe's facial
	 * transformation matrix, in its canonical-face units: camera looks down -Z, Y up).
	 */
	pose?: Vec3;
}

export interface Tracker {
	readonly id: string;
	readonly label: string;
	readonly landmarkSet: LandmarkSetId;
	init(): Promise<void>;
	/** timestampMs must strictly increase across calls. */
	process(video: HTMLVideoElement, timestampMs: number): TrackFrame;
	dispose(): void;
}

/** One logged frame. Estimator outputs are stored raw (pixels) and calibrated post hoc. */
export interface FrameRecord {
	/** Session-relative ms: wall clock when live, media time when replaying. */
	t: number;
	stepId: string | null;
	detected: boolean;
	procMs: number;
	/** Capture-to-result latency, when the browser reports capture time (live only). */
	captureToResultMs: number | null;
	centres: Record<string, Vec2>;
	sizes: Record<string, number>;
}
