import { defineConfig } from '@playwright/test';

export default defineConfig({
	testDir: 'e2e',
	timeout: 15 * 60_000,
	use: { baseURL: 'http://localhost:4173' },
	// The app lives at the repo root, one level up.
	webServer: {
		command: 'npm run build && npm run preview',
		cwd: '..',
		port: 4173,
		reuseExistingServer: true
	}
});
