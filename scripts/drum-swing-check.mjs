/**
 * Does swing reach the audio? Renders a sixteenth-note pattern and an
 * eighth-note pattern (on both swing grids) through the drum machine's own offline render
 * (`renderDrumPatternWav`, the same step player the live engine uses),
 * straight and fully swung, finds the onsets in the WAV and prints them
 * in milliseconds. Passes when the swung odd sixteenths land a third of a
 * step late and everything else stays put; fails otherwise.
 *
 *   bun run check:swing                       # against the dev server
 *   SMOKE_BASE=https://staging.stemshovel.dev bun run check:swing
 *
 * Needs the dev server's module URLs, so it runs against a dev server
 * (a built site has no /src). Playwright's Chromium does the rendering.
 */
import { chromium } from "playwright";

const base = process.env.SMOKE_BASE ?? "https://stem-shovel.wr.lj.dev";
const browser = await chromium.launch();
const page = await browser.newPage();
page.setDefaultTimeout(60_000);
await page.goto(`${base}/drum-machine`);
await page.waitForLoadState("networkidle");

const result = await page.evaluate(async () => {
	const { renderDrumPatternWav } = await import("/src/lib/audio/drumRender.ts");
	const { DEFAULT_DRUM_FX } = await import("/src/lib/constants/drumMachine.ts");
	const onsets = async (cells, swing, swingGrid = 16) => {
		const pattern = {
			meter: "4/4",
			steps: 16,
			rows: [{ voice: "rim", level: 1, pan: 0, mute: false, cells }],
		};
		const project = {
			v: 2,
			bpm: 120,
			swing,
			swingGrid,
			humanize: 0,
			fx: { ...DEFAULT_DRUM_FX },
			kit: "electronic",
			patterns: [pattern],
		};
		const blob = await renderDrumPatternWav(project, pattern, 44100);
		const buf = await new OfflineAudioContext(1, 1, 44100).decodeAudioData(
			await blob.arrayBuffer(),
		);
		const d = buf.getChannelData(0);
		const found = [];
		let last = -1e9;
		for (let i = 0; i < d.length; i++) {
			if (Math.abs(d[i]) > 0.05 && i - last > 2000) {
				found.push(i / 44.1);
				last = i;
			}
		}
		return found;
	};
	const sixteenths = Array(16).fill(2);
	const eighths = Array.from({ length: 16 }, (_, i) => (i % 2 === 0 ? 2 : 0));
	return {
		sixteenthsStraight: await onsets(sixteenths, 0),
		sixteenthsSwung: await onsets(sixteenths, 1),
		eighthsStraight: await onsets(eighths, 0),
		eighthsSwung: await onsets(eighths, 1),
		eighthsSwungOn8: await onsets(eighths, 1, 8),
	};
});
await browser.close();

const step = 125; // ms, a sixteenth at 120 bpm
const show = (name, xs) => console.log(name.padEnd(20), xs.map((x) => Math.round(x)).join(" "));
for (const [name, xs] of Object.entries(result)) show(name, xs);

let failed = false;
const near = (a, b) => Math.abs(a - b) < 6;
for (let i = 0; i < 16; i++) {
	const straight = result.sixteenthsStraight[i];
	const swung = result.sixteenthsSwung[i];
	const want = i % 2 === 1 ? straight + step / 3 : straight;
	if (straight === undefined || swung === undefined || !near(swung, want)) {
		console.error(`step ${i + 1}: expected ${Math.round(want)} ms, got ${Math.round(swung)} ms`);
		failed = true;
	}
}
for (let i = 0; i < 8; i++) {
	if (!near(result.eighthsStraight[i], result.eighthsSwung[i])) {
		console.error(
			`eighth ${i + 1} moved with swing: ${result.eighthsStraight[i]} → ${result.eighthsSwung[i]}`,
		);
		failed = true;
	}
}
for (let i = 0; i < 8; i++) {
	const straight = result.eighthsStraight[i];
	const want = i % 2 === 1 ? straight + (step * 2) / 3 : straight; // the off-beat eighths, a third of an eighth late
	if (!near(result.eighthsSwungOn8[i], want)) {
		console.error(
			`1/8 grid, eighth ${i + 1}: expected ${Math.round(want)} ms, got ${Math.round(result.eighthsSwungOn8[i])} ms`,
		);
		failed = true;
	}
}
console.log(
	failed
		? "swing check failed"
		: "swing check passed: 1/16 moves the odd sixteenths a third of a step, 1/8 moves the off-beat eighths a third of an eighth, nothing else moves",
);
process.exit(failed ? 1 : 0);
