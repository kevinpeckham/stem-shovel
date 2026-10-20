import { expect, hooked, open, test, until } from "./fixtures";

/**
 * A song's stem as a layer in the looper (docs/looper.md, "Stems from
 * songs"): the Load menu's Import a stem lists the bot's songs with
 * stems; the first stem of the first song comes in as one layer, then the
 * loop is cleared.
 */
test("imports a song's stem as a layer", async ({ page, errors }) => {
	test.setTimeout(120_000);
	await open(page, "/looper", "__looper");
	await hooked(page, ([w]) => {
		w.__looper.clear();
		w.__looper.setBpm(120);
		w.__looper.setBars(1);
	});
	await page.getByRole("button", { name: "Load a loop" }).click();
	const section = page.locator("[data-import-stems]");
	test.skip(!(await section.count()), "no songs with stems in the bot's accounts");
	await expect(section).toBeVisible();
	const first = section.getByRole("list").getByRole("button").first();
	const label = (await first.textContent())?.trim().split("\n")[0] ?? "";
	await first.click();
	await until(page, ([w]) => w.__looper.layers.length === 1, { ms: 60_000 });
	const layer = await hooked(page, ([w]) => {
		const l = w.__looper.layers[0];
		return {
			label: l.label,
			seconds: l.buffer.length / l.buffer.sampleRate,
			loopSeconds: w.__looper.loopSeconds,
			bars: w.__looper.bars,
		};
	});
	expect(label).toContain(layer.label);
	// An empty loop takes its length from the stem (1, 2, 4 or 8 bars at 120 bpm); the layer is cut to it.
	expect([1, 2, 4, 8]).toContain(layer.bars);
	expect(layer.seconds).toBeCloseTo(layer.loopSeconds, 1);
	await hooked(page, ([w]) => w.__looper.clear());
	expect(errors).toEqual([]);
});
