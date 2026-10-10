import { expect, hooked, open, test, until } from "./fixtures";

/**
 * The Practice Amp (docs/practice-amp.md) with the fake microphone: the
 * switch opens the input and the meters move; the chain renders a test
 * tone offline through each head without blowing up or going silent;
 * off closes the input.
 */
test("the amp turns on, hears the input, renders through every head, and turns off", async ({
	page,
	errors,
}) => {
	await open(page, "/practice-amp", "__amp");
	const device = page.getByRole("group", { name: "Head" });
	await expect(device).toBeVisible();
	await page.getByRole("button", { name: "Turn the amp on" }).click();
	await until(page, ([w]) => w.__amp.on === true);
	// The fake device plays a tone: the input meter reads it within a moment.
	await until(page, ([w]) => w.__amp.inputLevel > 0.01);
	await expect(page.getByText(/Latency/)).toBeVisible();
	for (const model of ["clean", "tweed", "fridge", "solid"] as const) {
		await hooked(page, ([w, m]) => w.__amp.setModel(m), model);
		const r = await hooked(page, ([w]) => w.__amp.render(0.5));
		expect(r.rms, model).toBeGreaterThan(0.01);
		expect(r.peak, model).toBeLessThanOrEqual(1);
	}
	// A pedal on changes the sound; the same tone renders louder through the fuzz's make-up or not, but still sounds.
	await hooked(page, ([w]) => w.__amp.setPedal("fuzz", { drive: 0.8 }));
	const fuzzed = await hooked(page, ([w]) => w.__amp.render(0.5));
	expect(fuzzed.rms).toBeGreaterThan(0.01);
	await hooked(page, ([w]) => w.__amp.resetRig());
	await page.getByRole("button", { name: "Turn the amp off" }).click();
	await until(page, ([w]) => w.__amp.on === false);
	expect(errors).toEqual([]);
});
