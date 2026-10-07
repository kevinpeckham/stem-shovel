import { defineConfig } from "@playwright/test";

/**
 * The browser tests (docs/testing.md, "Browser tests"): Chromium against a
 * running dev server (the VM's by default, `E2E_BASE` for another), signed
 * in as the Screenshot Bot through the preview token, the microphone a fake
 * device so the recorder, the looper and the Studio record something. One
 * worker, since the specs share the bot's account. Run through varlock for
 * the token: `bunx varlock run -- bun run test:e2e`.
 */
export default defineConfig({
	testDir: "tests/e2e",
	testMatch: "**/*.spec.ts",
	timeout: 120_000,
	expect: { timeout: 10_000 },
	workers: 1,
	fullyParallel: false,
	retries: 0,
	reporter: [["list"]],
	outputDir: ".screenshots/e2e",
	use: {
		baseURL: process.env.E2E_BASE ?? "https://stem-shovel.wr.lj.dev",
		viewport: { width: 1500, height: 1000 },
		permissions: ["microphone"],
		trace: "retain-on-failure",
		launchOptions: {
			args: [
				"--autoplay-policy=no-user-gesture-required",
				"--use-fake-ui-for-media-stream",
				"--use-fake-device-for-media-stream",
			],
		},
	},
	projects: [{ name: "chromium", use: { browserName: "chromium" } }],
});
