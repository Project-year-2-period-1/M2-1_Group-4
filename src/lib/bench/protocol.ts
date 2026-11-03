/**
 * The scripted session every participant runs, once per condition (lighting, glasses, ...).
 * Record it once live, then replay the recording through every tracker.
 *
 * Known head positions, all mm from the webcam to between the eyes:
 *  - Depth poses, each measured once with a tape measure: C = sitting normally,
 *    N = leaning in, F = leaning back.
 *  - Sideways: tape on the desk's front edge straight below the webcam (centre) and dx to
 *    either side (L, R). "At R" = pose C with your nose in line with the R tape.
 */
export interface Marks {
	/** Pose C: sitting normally. */
	z0: number;
	/** Sideways offset of the L/R tape from the centre tape. */
	dx: number;
	/** Pose N: leaning in. */
	zNear: number;
	/** Pose F: leaning back. */
	zFar: number;
}

export const DEFAULT_MARKS: Marks = { z0: 600, dx: 150, zNear: 500, zFar: 700 };

/**
 * True when the distances were probably typed in cm: nobody sits under 15 cm from the camera,
 * and tape under 3 cm apart is not a real setup. (Happened in a real session.)
 */
export const looksLikeCm = (m: Pick<Marks, 'z0' | 'dx'>) => m.z0 < 150 || m.dx < 30;

export type StepKind =
	| 'calibration'
	| 'static'
	| 'expression'
	| 'rotation'
	| 'motion'
	| 'occlusion'
	| 'absent'
	| 'return';

export interface Step {
	id: string;
	kind: StepKind;
	instruction: string;
	durationMs: number;
	/** Known head position (mm, camera space) during the step, if there is one. */
	truth?: (m: Marks) => { x: number; z: number };
}

/** Unlabelled time before each step to move into position; frames in it are not scored. */
// 5 s: in the first real session 3 s was not enough to slide 15 cm sideways and settle.
export const PREP_MS = 5000;

/** x: -1/0/1 = L/centre/R; z: -1/0/1 = pose N/C/F. */
const at = (x: -1 | 0 | 1, z: -1 | 0 | 1) => (m: Marks) => ({
	x: x * m.dx,
	z: z < 0 ? m.zNear : z > 0 ? m.zFar : m.z0
});

export const PROTOCOL: Step[] = [
	{
		id: 'calibCentre',
		kind: 'calibration',
		instruction:
			'Sit normally (pose C), nose in line with the centre tape. Look at the screen, hold still.',
		durationMs: 5000,
		truth: at(0, 0)
	},
	{
		id: 'calibLateral',
		kind: 'calibration',
		instruction:
			"Move to your right: pose C, nose in line with the R tape. Move your chair or whole body, don't lean. Hold still.",
		durationMs: 5000,
		truth: at(1, 0)
	},
	{
		id: 'staticL',
		kind: 'static',
		instruction:
			"Move to your left: pose C, nose in line with the L tape. Move your chair or whole body, don't lean. Hold still.",
		durationMs: 5000,
		truth: at(-1, 0)
	},
	{
		id: 'staticNear',
		kind: 'static',
		instruction: 'Centre tape, lean in (pose N). Hold still.',
		durationMs: 5000,
		truth: at(0, -1)
	},
	{
		id: 'staticFar',
		kind: 'static',
		instruction: 'Centre tape, lean back (pose F). Hold still.',
		durationMs: 5000,
		truth: at(0, 1)
	},
	{
		id: 'staticC',
		kind: 'static',
		instruction: 'Back to sitting normally at the centre tape (pose C). Hold still.',
		durationMs: 5000,
		truth: at(0, 0)
	},
	{
		id: 'expression',
		kind: 'expression',
		instruction: 'Pose C at the centre. Keep your head still: talk, smile, blink.',
		durationMs: 8000,
		truth: at(0, 0)
	},
	{
		id: 'yaw',
		kind: 'rotation',
		instruction:
			'Pose C at the centre. Slowly turn your head left and right (shake "no"), don\'t slide it.',
		durationMs: 8000
	},
	{
		id: 'pitch',
		kind: 'rotation',
		instruction: 'Pose C at the centre. Slowly nod up and down.',
		durationMs: 8000
	},
	{
		id: 'motion',
		kind: 'motion',
		instruction: 'Sway smoothly between the L and R tape, about once per second.',
		durationMs: 10000
	},
	{
		id: 'occlusion',
		kind: 'occlusion',
		instruction: 'Pose C at the centre. Cover your mouth and chin with one hand.',
		durationMs: 5000,
		truth: at(0, 0)
	},
	{
		id: 'absent',
		kind: 'absent',
		instruction: 'Lean fully out of the camera view.',
		durationMs: 3000
	},
	{
		id: 'return',
		kind: 'return',
		instruction: 'Come back: pose C at the centre tape.',
		durationMs: 4000
	}
];

export interface Segment {
	stepId: string;
	startMs: number;
	endMs: number;
}

/** Session-relative timeline for the protocol. */
export function buildTimeline(steps: Step[] = PROTOCOL): Segment[] {
	let t = 0;
	return steps.map((s) => {
		t += PREP_MS;
		const seg = { stepId: s.id, startMs: t, endMs: t + s.durationMs };
		t = seg.endMs;
		return seg;
	});
}

export function stepAt(timeline: Segment[], t: number): string | null {
	return timeline.find((s) => t >= s.startMs && t < s.endMs)?.stepId ?? null;
}

export interface SessionMeta {
	participant: string;
	lighting: 'normal' | 'dim' | 'backlit';
	glasses: boolean;
	machine: string;
	notes: string;
	marks: Marks;
	recordedAt: string;
}
