import { expect, hooked, open, test, until } from "./fixtures";

/**
 * The looper (docs/looper.md) with the fake microphone: a layer records
 * from the next bar 1 and lasts exactly the loop; the loop is cleared so
 * nothing stays in the browser store.
 */
test("records a microphone layer the length of the loop and clears it", async ({
	page,
	errors,
}) => {
	await open(page, "/looper", "__looper");
	await page
		.getByRole("button", { name: /^Microphone/ })
		.first()
		.click();
	await until(page, ([w]) => w.__inputs.has("mic"));
	await hooked(page, ([w]) => {
		w.__looper.setBpm(120);
		w.__looper.setBars(1);
		w.__looper.countIn = false;
	});
	await hooked(page, ([w]) => w.__looper.record());
	await until(page, ([w]) => w.__looper.phase === "recording");
	// One bar at 120 bpm is 2 s; a pass lands when its tail is in.
	await until(page, ([w]) => w.__looper.layers.length === 1, { ms: 20_000 });
	await hooked(page, ([w]) => w.__looper.finishRecording());
	const layer = await hooked(page, ([w]) => {
		const l = w.__looper.layers[0];
		return {
			source: l.source,
			seconds: l.buffer.length / l.buffer.sampleRate,
			peaks: l.peaks.length,
		};
	});
	expect(layer.source).toBe("mic");
	expect(layer.seconds).toBeCloseTo(2, 2);
	expect(layer.peaks).toBe(512);
	await hooked(page, ([w]) => w.__looper.stop());
	await hooked(page, ([w]) => w.__looper.clear());
	expect(await hooked(page, ([w]) => w.__looper.layers.length)).toBe(0);
	expect(errors).toEqual([]);
});
