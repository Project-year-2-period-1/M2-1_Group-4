import { evaluateOptions } from './estimators';
import { stepAt, type Segment, type SessionMeta } from './protocol';
import type { FrameRecord, TrackFrame, Tracker } from './types';

/** Saved next to a recording so it can be replayed through any tracker later. */
export interface Sidecar {
	version: 1;
	meta: SessionMeta;
	timeline: Segment[];
}

export interface RunHandle {
	/** performance.now() at session time 0 (live mode). */
	startedAt: number;
	/** Resolves with every frame once the protocol (live) or the video (replay) ends. */
	done: Promise<{ records: FrameRecord[]; droppedFrames: number }>;
	stop(): void;
}

interface RunOptions {
	tracker: Tracker;
	video: HTMLVideoElement;
	timeline: Segment[];
	mode: 'live' | 'replay';
	onFrame?: (record: FrameRecord, frame: TrackFrame) => void;
}

/**
 * Runs the tracker on every presented video frame. Live: session time is wall clock from the
 * call. Replay: session time is the video's media time, so the timeline recorded live lines
 * up. Replay should run slowed down (video.playbackRate) so no frame is skipped; skipped
 * frames are counted in droppedFrames.
 */
export function runSession({ tracker, video, timeline, mode, onFrame }: RunOptions): RunHandle {
	const records: FrameRecord[] = [];
	const t0 = performance.now();
	const endMs = timeline[timeline.length - 1].endMs + 1000;
	let dropped = 0;
	let lastPresented = -1;
	let lastTs = -Infinity;
	let handle = 0;
	let stopped = false;
	let finish!: () => void;

	const done = new Promise<{ records: FrameRecord[]; droppedFrames: number }>((resolve) => {
		finish = () => {
			if (stopped) return;
			stopped = true;
			video.cancelVideoFrameCallback(handle);
			video.removeEventListener('ended', finish);
			resolve({ records, droppedFrames: dropped });
		};
	});

	const onVideoFrame: VideoFrameRequestCallback = (_now, meta) => {
		if (stopped) return;
		if (lastPresented >= 0 && meta.presentedFrames > lastPresented + 1)
			dropped += meta.presentedFrames - lastPresented - 1;
		lastPresented = meta.presentedFrames;

		const t = mode === 'live' ? performance.now() - t0 : meta.mediaTime * 1000;
		// Trackers need strictly increasing timestamps; replay can repeat a media time.
		const ts = Math.max(t, lastTs + 0.001);
		lastTs = ts;

		const start = performance.now();
		const frame = tracker.process(video, ts);
		const end = performance.now();
		const { centres, sizes } = evaluateOptions(tracker.landmarkSet, frame);
		const record: FrameRecord = {
			t,
			stepId: stepAt(timeline, t),
			detected: frame.landmarks !== null,
			procMs: end - start,
			captureToResultMs: mode === 'live' && meta.captureTime ? end - meta.captureTime : null,
			centres,
			sizes
		};
		records.push(record);
		onFrame?.(record, frame);

		if (mode === 'live' && t > endMs) finish();
		else handle = video.requestVideoFrameCallback(onVideoFrame);
	};

	video.addEventListener('ended', finish);
	handle = video.requestVideoFrameCallback(onVideoFrame);
	return { startedAt: t0, done, stop: finish };
}

/**
 * Front camera, 720p if available. `ideal` rather than exact values so phones that can't
 * match them still open the camera instead of throwing.
 */
export const CAMERA: MediaStreamConstraints = {
	video: {
		facingMode: 'user',
		width: { ideal: 1280 },
		height: { ideal: 720 },
		frameRate: { ideal: 30 }
	},
	audio: false
};

/** Safari records mp4, everything else webm. */
export const recordingExtension = (blob: Blob) => (blob.type.includes('mp4') ? 'mp4' : 'webm');

/** Records the webcam stream for later replay. */
export function startRecording(stream: MediaStream): { stop(): Promise<Blob> } {
	const mime = ['video/webm;codecs=vp9', 'video/webm'].find((m) =>
		MediaRecorder.isTypeSupported(m)
	);
	// High bitrate: compression artefacts are noise the trackers would otherwise be judged on.
	const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
	const chunks: Blob[] = [];
	rec.ondataavailable = (e) => chunks.push(e.data);
	rec.start();
	return {
		stop: () =>
			new Promise((resolve) => {
				rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
				rec.stop();
			})
	};
}

export function toCsv(records: FrameRecord[], meta: SessionMeta, tracker: string): string {
	const centreIds = [...new Set(records.flatMap((r) => Object.keys(r.centres)))];
	const sizeIds = [...new Set(records.flatMap((r) => Object.keys(r.sizes)))];
	const header = [
		'tracker',
		'participant',
		'lighting',
		'glasses',
		'machine',
		't_ms',
		'step',
		'detected',
		'proc_ms',
		'capture_to_result_ms',
		...centreIds.flatMap((c) => [`c_${c}_x`, `c_${c}_y`]),
		...sizeIds.map((s) => `s_${s}`)
	];
	const esc = (v: unknown) => {
		const s = v == null ? '' : String(v);
		return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
	};
	const rows = records.map((r) =>
		[
			tracker,
			meta.participant,
			meta.lighting,
			meta.glasses,
			meta.machine,
			r.t.toFixed(2),
			r.stepId,
			r.detected,
			r.procMs.toFixed(3),
			r.captureToResultMs?.toFixed(2),
			...centreIds.flatMap((c) => [r.centres[c]?.x.toFixed(3), r.centres[c]?.y.toFixed(3)]),
			...sizeIds.map((s) => r.sizes[s]?.toFixed(4))
		]
			.map(esc)
			.join(',')
	);
	return [header.join(','), ...rows].join('\n');
}

export function download(name: string, data: Blob | string, type = 'text/plain') {
	const blob = typeof data === 'string' ? new Blob([data], { type }) : data;
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
