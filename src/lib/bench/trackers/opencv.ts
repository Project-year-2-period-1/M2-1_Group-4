import { base } from '$app/paths';
import type { TrackFrame, Tracker } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any -- OpenCV.js ships no types */
type CV = any;

let cvPromise: Promise<CV> | null = null;

/** Loads the custom OpenCV.js build (facialID-test/scripts/build-opencv.sh) once per page. */
function loadOpenCv(): Promise<CV> {
	cvPromise ??= new Promise<CV>((resolve, reject) => {
		const script = document.createElement('script');
		script.src = `${base}/opencv/opencv.js`;
		script.async = true;
		script.onerror = () =>
			reject(
				new Error('static/opencv/opencv.js missing: run facialID-test/scripts/build-opencv.sh')
			);
		script.onload = async () => {
			// Depending on the build, `cv` is the module, a promise, or a module that fires
			// onRuntimeInitialized later.
			let cv = (window as any).cv;
			if (cv instanceof Promise) cv = await cv;
			else if (!cv.Mat) await new Promise<void>((r) => (cv.onRuntimeInitialized = r));
			resolve(cv);
		};
		document.head.appendChild(script);
	});
	return cvPromise;
}

async function mountFile(cv: CV, url: string, name: string) {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${url}: ${res.status}`);
	const data = new Uint8Array(await res.arrayBuffer());
	try {
		cv.FS_unlink(`/${name}`);
	} catch {
		// not mounted yet
	}
	cv.FS_createDataFile('/', name, data, true, false, false);
}

/**
 * Arm A: OpenCV alone, as it is typically used for landmarks. Haar cascade finds the face on
 * a downscaled frame every frame, Facemark LBF fits the 68 iBUG landmarks at full resolution.
 *
 * No preprocessing or detect-skipping: those are levers either arm could get, and belong in
 * their own add-on tests.
 */
export class OpenCvTracker implements Tracker {
	readonly id = 'opencv';
	readonly label = 'A: OpenCV + contrib (Haar + Facemark LBF)';
	readonly landmarkSet = 'ibug68' as const;

	private cv: CV = null;
	private cascade: CV = null;
	private facemark: CV = null;
	private canvas = document.createElement('canvas');
	private ctx = this.canvas.getContext('2d', { willReadFrequently: true })!;

	/** Width the detector runs at; landmarks still use the full frame. */
	constructor(private readonly detectWidth = 320) {}

	async init() {
		const cv = (this.cv = await loadOpenCv());
		// embindgen binds the createFacemarkLBF() factory as the class constructor.
		if (typeof cv.face_Facemark !== 'function')
			throw new Error(
				'This opencv.js has no Facemark: rebuild with facialID-test/scripts/build-opencv.sh'
			);
		await Promise.all([
			mountFile(cv, `${base}/opencv/haarcascade_frontalface_default.xml`, 'haar.xml'),
			mountFile(cv, `${base}/opencv/lbfmodel.yaml`, 'lbfmodel.yaml')
		]);
		this.cascade = new cv.CascadeClassifier();
		if (!this.cascade.load('haar.xml')) throw new Error('Failed to load Haar cascade');
		this.facemark = new cv.face_Facemark();
		this.facemark.loadModel('lbfmodel.yaml');
	}

	process(video: HTMLVideoElement): TrackFrame {
		const cv = this.cv;
		const w = video.videoWidth;
		const h = video.videoHeight;
		if (this.canvas.width !== w || this.canvas.height !== h) {
			this.canvas.width = w;
			this.canvas.height = h;
		}
		this.ctx.drawImage(video, 0, 0, w, h);

		const rgba = cv.matFromImageData(this.ctx.getImageData(0, 0, w, h));
		const gray = new cv.Mat();
		const small = new cv.Mat();
		const faces = new cv.RectVector();
		const landmarks = new cv.MatVector();
		let roi: CV = null;
		try {
			cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
			const scale = w / this.detectWidth;
			cv.resize(gray, small, new cv.Size(this.detectWidth, Math.round(h / scale)));
			const minFace = Math.round(this.detectWidth / 8);
			this.cascade.detectMultiScale(small, faces, 1.1, 3, 0, new cv.Size(minFace, minFace));
			if (faces.size() === 0) return { landmarks: null };

			let best = faces.get(0);
			for (let i = 1; i < faces.size(); i++) {
				const f = faces.get(i);
				if (f.width * f.height > best.width * best.height) best = f;
			}
			const rect = [best.x, best.y, best.width, best.height].map((v) => Math.round(v * scale));
			roi = cv.matFromArray(1, 1, cv.CV_32SC4, rect);
			if (!this.facemark.fit(gray, roi, landmarks) || landmarks.size() === 0)
				return { landmarks: null };

			const pts = landmarks.get(0);
			const d: Float32Array = pts.data32F;
			const out = [];
			for (let i = 0; i < d.length; i += 2) out.push({ x: d[i], y: d[i + 1] });
			pts.delete();
			return { landmarks: out };
		} finally {
			[rgba, gray, small, faces, landmarks, roi].forEach((m) => m?.delete());
		}
	}

	dispose() {
		this.cascade?.delete();
		this.facemark?.delete();
		this.cascade = this.facemark = null;
	}
}
