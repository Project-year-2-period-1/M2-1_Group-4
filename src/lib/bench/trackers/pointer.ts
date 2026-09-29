import type { TrackFrame, Tracker } from '../types';

/**
 * Control arm: the mouse pointer stands in for the face. It has no tracking error, so it
 * measures the latency floor of the display path and validates logging/analysis end to end.
 * It does NOT give an accuracy baseline for the real trackers.
 */
export class PointerTracker implements Tracker {
	readonly id = 'pointer';
	readonly label = 'Control: mouse pointer';
	readonly landmarkSet = 'pointer' as const;
	/** Pointer position normalised to the viewport, 0..1, or null when outside it. */
	private pos: { x: number; y: number } | null = null;
	private readonly onMove = (e: PointerEvent) => {
		this.pos = { x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight };
	};
	private readonly onLeave = () => (this.pos = null);

	async init() {
		window.addEventListener('pointermove', this.onMove);
		document.documentElement.addEventListener('pointerleave', this.onLeave);
	}

	process(video: HTMLVideoElement): TrackFrame {
		if (!this.pos) return { landmarks: null };
		// Mirror x so moving the mouse right matches moving your head right in a selfie view.
		return {
			landmarks: [{ x: (1 - this.pos.x) * video.videoWidth, y: this.pos.y * video.videoHeight }]
		};
	}

	dispose() {
		window.removeEventListener('pointermove', this.onMove);
		document.documentElement.removeEventListener('pointerleave', this.onLeave);
	}
}
