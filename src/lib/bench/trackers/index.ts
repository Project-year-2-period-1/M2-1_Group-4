import type { LandmarkSetId, Tracker } from '../types';

export const TRACKERS = {
	opencv: { label: 'A: OpenCV + contrib (Haar + Facemark LBF)', landmarkSet: 'ibug68' },
	mediapipe: { label: 'B: MediaPipe Face Landmarker', landmarkSet: 'mp478' },
	pointer: { label: 'Control: mouse pointer', landmarkSet: 'pointer' }
} as const satisfies Record<string, { label: string; landmarkSet: LandmarkSetId }>;

export type TrackerId = keyof typeof TRACKERS;

/** Lazy so a page only downloads the arms it actually runs. */
export async function createTracker(id: TrackerId): Promise<Tracker> {
	switch (id) {
		case 'opencv':
			return new (await import('./opencv')).OpenCvTracker();
		case 'mediapipe':
			return new (await import('./mediapipe')).MediaPipeTracker();
		case 'pointer':
			return new (await import('./pointer')).PointerTracker();
	}
}
