/**
 * One Euro filter (Casiez et al., CHI 2012): a low-pass whose cutoff rises with speed, so
 * slow drift is smoothed hard and fast motion lags little. Every arm is filtered with the
 * same parameters, otherwise the comparison measures filter tuning instead of tracking.
 */
export interface OneEuroParams {
	/** Hz. Lower = less jitter at rest, more lag. */
	minCutoff: number;
	/** How fast the cutoff rises with speed. Higher = less lag when moving. */
	beta: number;
	/** Hz, cutoff for the derivative estimate. */
	dCutoff: number;
}

export const DEFAULT_ONE_EURO: OneEuroParams = { minCutoff: 1, beta: 0.01, dCutoff: 1 };

const alpha = (cutoff: number, dt: number) => 1 / (1 + 1 / (2 * Math.PI * cutoff * dt));

export class OneEuro {
	private x: number | null = null;
	private dx = 0;
	private tPrev = 0;

	constructor(private readonly p: OneEuroParams = DEFAULT_ONE_EURO) {}

	/** tMs must increase; a repeated or earlier timestamp returns the previous output. */
	filter(value: number, tMs: number): number {
		if (this.x === null) {
			this.x = value;
			this.tPrev = tMs;
			return value;
		}
		const dt = (tMs - this.tPrev) / 1000;
		if (dt <= 0) return this.x;
		this.tPrev = tMs;
		const rawDx = (value - this.x) / dt;
		this.dx += alpha(this.p.dCutoff, dt) * (rawDx - this.dx);
		const cutoff = this.p.minCutoff + this.p.beta * Math.abs(this.dx);
		this.x += alpha(cutoff, dt) * (value - this.x);
		return this.x;
	}

	reset() {
		this.x = null;
		this.dx = 0;
	}
}
