#!/usr/bin/env node
// Renders a face photo moving through the bench protocol with exactly known positions
// (ideal pinhole camera), plus its sidecar. Replaying it checks the whole pipeline against
// ground truth with no human error. Rotation/expression steps can't be faked in 2D, so the
// face just holds still there; occlusion is a box over the lower face.
//
//   node facialID-test/scripts/make-synthetic.mjs <face.jpg> [eyeX eyeY] [outDir]
// eyeX/eyeY: eye midpoint as a fraction of the image (default 0.590 0.527, measured on
// OpenCV's samples/data/lena.jpg). The eyes are what moves along the true path, like a head
// over the desk marks. Needs ffmpeg.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [face, eyeXArg = '0.590', eyeYArg = '0.527', outDir = join(REPO, 'static/bench-fixtures')] =
	process.argv.slice(2);
const eyeX = Number(eyeXArg);
const eyeY = Number(eyeYArg);
if (!face) {
	console.error('usage: make-synthetic.mjs <face.jpg> [eyeX eyeY] [outDir]');
	process.exit(1);
}

// Mirrors src/lib/bench/protocol.ts (kept in sync by the e2e test, which replays this file).
const PREP_MS = 5000;
const marks = { z0: 600, dx: 150, zNear: 450, zFar: 750 };
const steps = [
	['calibCentre', 5000, 0, 0],
	['calibLateral', 5000, 1, 0],
	['staticL', 5000, -1, 0],
	['staticNear', 5000, 0, -1],
	['staticFar', 5000, 0, 1],
	['staticC', 5000, 0, 0],
	['expression', 8000, 0, 0],
	['yaw', 8000, 0, 0],
	['pitch', 8000, 0, 0],
	['motion', 10000, 'motion', 0],
	['occlusion', 5000, 0, 0],
	['absent', 3000, 'absent', 0],
	['return', 4000, 0, 0]
];

const W = 1280;
const H = 720;
const F = 900; // px focal length
const IMAGE_PX_AT_Z0 = 600; // rendered image size at z0 (face ≈ 200 px wide, like 60 cm)

let t = 0;
const timeline = [];
const pieces = []; // [startS, endS, x, z, prevX, prevZ]
let prev = [0, 0];
for (const [stepId, dur, x, z] of steps) {
	const next = { stepId, startMs: t + PREP_MS, endMs: t + PREP_MS + dur };
	timeline.push(next);
	// Move to the step's position during its prep period (glide, like a real person).
	pieces.push([t / 1000, next.endMs / 1000, x, z, ...prev]);
	prev = [x === 'motion' ? 0 : x, z]; // motion ends back at x = 0 (whole periods)
	t = next.endMs;
}
const GLIDE_S = 1.5;
const duration = t / 1000 + 1;

// Piecewise expressions over t (seconds) for lateral mm and distance mm.
const xMm = (x) =>
	x === 'motion' ? `${marks.dx}*sin(2*PI*t)` : x === 'absent' ? '100000' : String(x * marks.dx);
const zMm = (z) => String(z < 0 ? marks.zNear : z > 0 ? marks.zFar : marks.z0);
const glide = (a, from, to) =>
	from === to ? to : `if(lt(t,${a + GLIDE_S}),${from}+(${to}-${from})*(t-${a})/${GLIDE_S},${to})`;
const piecewise = (f, fallback) =>
	pieces.reduceRight(
		(acc, [a, b, x, z, px, pz]) => `if(between(t,${a},${b}),${f(a, x, z, px, pz)},${acc})`,
		fallback
	);
// Leaving/entering the frame (absent) is a jump; everything else glides.
const X = piecewise(
	(a, x, _z, px) =>
		x === 'motion' || x === 'absent' || px === 'absent' ? xMm(x) : glide(a, xMm(px), xMm(x)),
	'0'
);
const Z = piecewise((a, _x, z, _px, pz) => glide(a, zMm(pz), zMm(z)), zMm(0));
const size = `(${IMAGE_PX_AT_Z0}*${marks.z0}/(${Z}))`;
// Camera image is not mirrored: head moving to +x appears at smaller image x.
const cx = `(${W / 2}-${F}*(${X})/(${Z}))`;

const occl = timeline.find((s) => s.stepId === 'occlusion');
mkdirSync(outDir, { recursive: true });
const video = join(outDir, 'synthetic.webm');
execFileSync(
	'ffmpeg',
	[
		'-y',
		'-loglevel',
		'error',
		'-f',
		'lavfi',
		'-i',
		`color=c=0x606060:s=${W}x${H}:r=30:d=${duration}`,
		'-loop',
		'1',
		'-r',
		'30',
		'-i',
		face,
		'-filter_complex',
		[
			`[1:v]scale=w='${size}':h='${size}':eval=frame[f]`,
			`[0:v][f]overlay=x='${cx}-overlay_w*${eyeX}':y='${H / 2}-overlay_h*${eyeY}':eval=frame:shortest=1[o]`,
			// Hand over mouth and chin (the face is at mark C during this step).
			`[o]drawbox=x=${W / 2 - 110}:y=${H / 2 + 50}:w=220:h=140:color=0xc08060:t=fill:enable='between(t,${occl.startMs / 1000 - 1},${occl.endMs / 1000})'[v]`
		].join(';'),
		'-map',
		'[v]',
		'-t',
		String(duration),
		'-c:v',
		'libvpx-vp9',
		'-b:v',
		'8M',
		'-deadline',
		'realtime',
		'-cpu-used',
		'8',
		video
	],
	{ stdio: 'inherit' }
);

const sidecar = {
	version: 1,
	meta: {
		participant: 'synthetic',
		lighting: 'normal',
		glasses: false,
		machine: 'synthetic',
		notes: `ideal pinhole f=${F}px, ${face}`,
		marks,
		recordedAt: new Date().toISOString()
	},
	timeline
};
writeFileSync(join(outDir, 'synthetic.sidecar.json'), JSON.stringify(sidecar, null, '\t'));
console.log(`wrote ${video} and synthetic.sidecar.json (${duration.toFixed(0)} s)`);
