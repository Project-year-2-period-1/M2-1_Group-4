import type { LandmarkSetId, TrackFrame, Vec2 } from './types';

/**
 * Suite 2 compares these. A position estimate = one centre option (where the head is in the
 * image) + one size option (how big it looks, which gives distance). Options that share an id
 * across landmark sets mean the same anatomical thing, so arms A and B can be compared on them.
 *
 * `unit` stops pixel centres being paired with pose-derived sizes and vice versa.
 */
export interface CentreOption {
	id: string;
	label: string;
	unit: 'px' | 'pose';
	get(frame: TrackFrame): Vec2 | null;
}

export interface SizeOption {
	id: string;
	label: string;
	unit: 'px' | 'pose';
	get(frame: TrackFrame): number | null;
}

const mean = (pts: Vec2[]): Vec2 => ({
	x: pts.reduce((s, p) => s + p.x, 0) / pts.length,
	y: pts.reduce((s, p) => s + p.y, 0) / pts.length
});
const dist = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);

function centre(id: string, label: string, idx: number[]): CentreOption {
	return {
		id,
		label,
		unit: 'px',
		get: (f) => (f.landmarks ? mean(idx.map((i) => f.landmarks![i])) : null)
	};
}

/** Distance between the means of two landmark groups. */
function span(id: string, label: string, a: number[], b: number[]): SizeOption {
	return {
		id,
		label,
		unit: 'px',
		get: (f) => {
			if (!f.landmarks) return null;
			const lm = f.landmarks;
			return dist(mean(a.map((i) => lm[i])), mean(b.map((i) => lm[i])));
		}
	};
}

// MediaPipe's pose uses an OpenGL-style camera (looks down -Z, Y up). Projecting it gives
// image-like coordinates (x right, y down) so the same pinhole calibration applies.
const poseCentre: CentreOption = {
	id: 'poseMatrix',
	label: 'MediaPipe transformation matrix',
	unit: 'pose',
	get: (f) => (f.pose ? { x: f.pose.x / -f.pose.z, y: f.pose.y / f.pose.z } : null)
};
const poseSize: SizeOption = {
	id: 'poseMatrix',
	label: 'MediaPipe transformation matrix',
	unit: 'pose',
	get: (f) => (f.pose ? 1 / -f.pose.z : null)
};

// MediaPipe Face Mesh indices: 33/133 and 362/263 are the eye corners (outer/inner), 468 and
// 473 the iris centres with 469-472 / 474-477 around them, 234/454 the cheek extremes.
const MP_CANTHI = [33, 133, 362, 263];
const MP_RIGID = [6, 168, 197, 33, 133, 362, 263, 127, 356];

// iBUG 68 (0-indexed, what Facemark LBF emits): 0-16 jaw, 27-30 nose bridge, 30 nose tip,
// 36-41 and 42-47 the eyes (36/45 outer corners, 39/42 inner).
const IB_EYE_A = [36, 37, 38, 39, 40, 41];
const IB_EYE_B = [42, 43, 44, 45, 46, 47];

export const ESTIMATORS: Record<LandmarkSetId, { centres: CentreOption[]; sizes: SizeOption[] }> = {
	mp478: {
		centres: [
			centre('noseTip', 'Nose tip', [1]),
			centre('canthiMid', 'Eye-corner midpoint', MP_CANTHI),
			centre('irisMid', 'Iris midpoint (cyclopean)', [468, 473]),
			centre('iris468', 'Iris 468 only', [468]),
			centre('iris473', 'Iris 473 only', [473]),
			centre('rigidMean', 'Rigid-landmark mean', MP_RIGID),
			poseCentre
		],
		sizes: [
			{
				id: 'irisDiameter',
				label: 'Iris diameter',
				unit: 'px',
				get: (f) => {
					if (!f.landmarks) return null;
					const lm = f.landmarks;
					return (dist(lm[469], lm[471]) + dist(lm[474], lm[476])) / 2;
				}
			},
			span('ipd', 'Interpupillary distance', [468], [473]),
			span('outerCanthi', 'Outer eye corners', [33], [263]),
			span('faceWidth', 'Face width', [234], [454]),
			poseSize
		]
	},
	ibug68: {
		centres: [
			centre('noseTip', 'Nose tip', [30]),
			centre('canthiMid', 'Eye-corner midpoint', [36, 39, 42, 45]),
			centre('eyeMid', 'Eye-contour midpoint', [...IB_EYE_A, ...IB_EYE_B]),
			centre('rigidMean', 'Rigid-landmark mean', [27, 28, 29, 30, 36, 39, 42, 45, 0, 16])
		],
		sizes: [
			span('ipd', 'Eye-centre distance (IPD proxy)', IB_EYE_A, IB_EYE_B),
			span('outerCanthi', 'Outer eye corners', [36], [45]),
			span('faceWidth', 'Face width', [0], [16])
		]
	},
	pointer: {
		centres: [centre('pointer', 'Mouse pointer', [0])],
		sizes: [{ id: 'none', label: 'Fixed', unit: 'px', get: (f) => (f.landmarks ? 1 : null) }]
	}
};

export interface EstimatorCombo {
	centre: string;
	size: string;
}

export const comboKey = (c: EstimatorCombo) => `${c.centre}/${c.size}`;

export function combosFor(set: LandmarkSetId): EstimatorCombo[] {
	const { centres, sizes } = ESTIMATORS[set];
	return centres.flatMap((c) =>
		sizes.filter((s) => s.unit === c.unit).map((s) => ({ centre: c.id, size: s.id }))
	);
}

/** Evaluates every option for a frame, dropping ones that are unavailable. */
export function evaluateOptions(set: LandmarkSetId, frame: TrackFrame) {
	const centres: Record<string, Vec2> = {};
	const sizes: Record<string, number> = {};
	for (const c of ESTIMATORS[set].centres) {
		const v = c.get(frame);
		if (v) centres[c.id] = v;
	}
	for (const s of ESTIMATORS[set].sizes) {
		const v = s.get(frame);
		if (v != null) sizes[s.id] = v;
	}
	return { centres, sizes };
}
