import type { Vec2, Vec3 } from './types';

/**
 * Library-free pinhole calibration from two known head positions, so neither arm gets help
 * from OpenCV's calibrateCamera (that is a separate, later add-on test).
 *
 * Coordinates are mm in camera space: x from the desk marks, z = distance from the camera,
 * y relative to head height during calibration (no vertical mark on a desk).
 *
 *  - Centre mark: straight in front of the camera at distance z0 -> defines the principal
 *    point (absorbing any offset between the landmark and the eyes).
 *  - Lateral mark: same z0, shifted sideways by dx -> gives the focal length in px. It is
 *    kept signed so a mirrored or unmirrored feed both come out right.
 *
 * The real size of the size reference (this person's IPD, iris, ...) falls out of the centre
 * sample, so no population-average anatomy is assumed.
 */
export interface Calibration {
	/** Signed focal length in centre-option units per unit of x/z. */
	f: number;
	principal: Vec2;
	/** Size reference in mm for this person. */
	realSize: number;
}

export interface CalibrationSample {
	centre: Vec2;
	size: number;
}

export function calibrate(
	atCentre: CalibrationSample,
	atLateral: CalibrationSample,
	z0: number,
	dx: number
): Calibration {
	const f = ((atLateral.centre.x - atCentre.centre.x) * z0) / dx;
	if (!Number.isFinite(f) || f === 0) throw new Error('Degenerate calibration: no lateral shift');
	return { f, principal: atCentre.centre, realSize: (atCentre.size * z0) / Math.abs(f) };
}

export function toMm(cal: Calibration, centre: Vec2, size: number): Vec3 {
	const fa = Math.abs(cal.f);
	const z = (fa * cal.realSize) / size;
	return {
		x: ((centre.x - cal.principal.x) * z) / cal.f,
		y: (-(centre.y - cal.principal.y) * z) / fa,
		z
	};
}
