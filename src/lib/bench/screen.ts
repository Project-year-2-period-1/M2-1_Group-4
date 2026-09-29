import { DEFAULT_MARKS, type Marks } from './protocol';
import type { ScreenGeometry } from './parallax';

/** Per-machine setup, remembered in the browser so it only has to be measured once. */
export interface LiveSetup {
	screen: ScreenGeometry;
	marks: Marks;
}

const KEY = 'bench.liveSetup';

export const DEFAULT_SETUP: LiveSetup = {
	screen: { width: 344, height: 194, cameraOffset: { x: 0, y: 105 } },
	marks: { ...DEFAULT_MARKS }
};

export function loadSetup(): LiveSetup {
	try {
		const raw = localStorage.getItem(KEY);
		if (raw) return { ...DEFAULT_SETUP, ...JSON.parse(raw) };
	} catch {
		// storage unavailable
	}
	return structuredClone(DEFAULT_SETUP);
}

export function saveSetup(setup: LiveSetup) {
	try {
		localStorage.setItem(KEY, JSON.stringify(setup));
	} catch {
		// storage unavailable
	}
}
