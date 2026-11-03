import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';
import type { SessionResult } from '../../src/lib/bench/analysis';

/**
 * Replays the synthetic ground-truth video (facialID-test/scripts/make-synthetic.mjs) through each arm in a
 * real browser and checks the whole pipeline: tracker loads, frames are processed, and the
 * analysed positions match the known ones. Thresholds are sanity bounds, not the criteria.
 */
const VIDEO = 'static/bench-fixtures/synthetic.webm';
const SIDECAR = 'static/bench-fixtures/synthetic.sidecar.json';

for (const tracker of ['mediapipe', 'opencv'] as const) {
	test(`synthetic replay through ${tracker}`, async ({ page }) => {
		test.skip(!existsSync(VIDEO), 'run facialID-test/scripts/make-synthetic.mjs first');
		page.on('console', (m) => m.type() === 'error' && console.log(`[browser] ${m.text()}`));

		await page.goto('/bench');
		await page.waitForLoadState('networkidle'); // controls only work once hydrated
		await page.getByLabel('Tracker').selectOption(tracker);
		await page.getByLabel('Source').selectOption('replay');
		await page.getByLabel(/^Recording/).setInputFiles(VIDEO);
		await page.getByLabel('Sidecar (.json)').setInputFiles(SIDECAR);
		// Headless has no GPU, so MediaPipe runs on CPU (~100 ms/frame): replay slowly enough
		// that no frame is dropped. Timing numbers from this test are not representative.
		await page.getByLabel(/Playback rate/).fill('0.25');
		await page.getByRole('button', { name: 'Start' }).click();

		await expect(page.getByRole('heading', { name: /^Result:/ })).toBeVisible({
			timeout: 10 * 60_000
		});
		const download = page.waitForEvent('download');
		await page.getByRole('button', { name: 'Result JSON' }).click();
		const result: SessionResult = JSON.parse(readFileSync(await (await download).path(), 'utf8'));

		const s = result.stats;
		console.log(tracker, JSON.stringify({ ...s, dropped: result.droppedFrames }));
		const perStep = result.combos[0].steps.map(
			(st) => `${st.stepId}=${st.detectionRate.toFixed(2)}`
		);
		console.log(`  detection by step: ${perStep.join(' ')}`);
		for (const c of [...result.combos].sort((a, b) => a.accuracyMm - b.accuracyMm))
			console.log(
				`  ${c.combo.padEnd(28)} acc ${c.accuracyMm.toFixed(1)}mm  jitter ${c.staticJitterRaw.toFixed(2)}/${c.staticJitterFiltered.toFixed(2)}mm  ${c.failure ?? ''}`
			);

		// Pipeline checks, not tracker verdicts: headless CPU timing drops some frames, and
		// detection quality is what the bench itself measures.
		expect(s.frames).toBeGreaterThan(3000);
		expect(result.droppedFrames / s.frames).toBeLessThan(0.1);
		expect(s.detectionRateNormal).toBeGreaterThan(0.8);
		expect(s.recoveryMs).not.toBeNull();
		const best = Math.min(...result.combos.map((c) => c.accuracyMm).filter(Number.isFinite));
		expect(best).toBeLessThan(25);
	});
}
