import { deleteStudioSongs, expect, hooked, open, test, until } from "./fixtures";

/**
 * The Studio's instrument inputs (docs/multitrack-recorder.md, phase 2):
 * a track armed to the drum machine plays the beat along with the
 * transport and records it as a take with sound in it; a piano track
 * records what the hosted piano plays. The song is deleted at the end.
 */
test.describe.serial("Studio instruments", () => {
	test("a drums track records the drum machine's beat", async ({ page, errors }) => {
		await open(page, "/studio", "__studio");
		// The instrument panels carry transport buttons of their own: the Studio's are inside its device.
		const device = page.getByRole("dialog", { name: "Studio" });
		await deleteStudioSongs(page);
		await page.getByRole("button", { name: "New song" }).click();
		await expect(page.getByLabel("Song title")).not.toHaveValue("");
		// The seeded track's input becomes the drum machine; its panel opens.
		await page.getByLabel(/Track 1 input/).selectOption("drums:stereo");
		await expect(page.getByRole("dialog", { name: "Drum machine" })).toBeVisible();
		await hooked(page, ([w]) => w.__studio.setCountIn(false));
		await page.mouse.click(700, 300); // the transport's own area: the space bar and the hooks are the test's
		await device.getByRole("button", { name: "Record", exact: true }).click();
		await until(page, ([w]) => w.__studio.phase === "recording" && w.__drums.running === true);
		await page.waitForTimeout(3000);
		await device.getByRole("button", { name: "Stop", exact: true }).click();
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
		await until(page, ([w]) => w.__drums.running === false);
		const take = await hooked(page, ([w]) => {
			const s = w.__studio;
			const clip = s.arrangement.clips[0];
			const src = s.sources[clip.sourceId];
			return { duration: clip.duration, channels: src.channels, peak: Math.max(...src.peaks) };
		});
		expect(take.duration).toBeGreaterThan(2.5);
		expect(take.channels).toBe(2);
		// The beat was in the take: the loudest bin is well above silence.
		expect(take.peak).toBeGreaterThan(0.05);
		// Phase 2b: the track's effects set from the menu are saved on the track and the bounce builds the same chain.
		await page.getByRole("button", { name: "Track 1 effects" }).click();
		await page.getByLabel("Track 1 reverb level").fill("0.6");
		await page.getByLabel("Track 1 tone tilt").fill("0.5");
		await page.keyboard.press("Escape");
		expect(await hooked(page, ([w]) => w.__studio.arrangement.tracks[0].fx)).toMatchObject({
			reverb: { level: 0.6 },
			tone: { tilt: 0.5 },
		});
		const rendered = await hooked(page, ([w]) =>
			w.__studio
				.render()
				.then((b: AudioBuffer) => ({ seconds: b.duration, channels: b.numberOfChannels })),
		);
		expect(rendered.channels).toBe(2);
		expect(rendered.seconds).toBeGreaterThan(2.5);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 30_000,
		});
		expect(errors).toEqual([]);
	});

	test("a piano track records the hosted piano, and the settings go with the song", async ({
		page,
	}) => {
		await open(page, "/studio", "__studio");
		const device = page.getByRole("dialog", { name: "Studio" });
		await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0);
		await page.getByRole("button", { name: "Add track" }).click();
		await page.getByRole("button", { name: /Arm Track 1/ }).click(); // disarm the drums
		await page.getByRole("button", { name: /Arm Track 2/ }).click();
		await page.getByLabel(/Track 2 input/).selectOption("piano:stereo");
		await expect(page.getByRole("dialog", { name: "Piano" })).toBeVisible();
		await hooked(page, ([w]) => {
			w.__studio.setCountIn(false);
			w.__studio.seek(0);
		});
		await page.mouse.click(700, 300);
		await device.getByRole("button", { name: "Record", exact: true }).click();
		await until(page, ([w]) => w.__studio.phase === "recording");
		// A chord held for a second, played straight into the hosted engine.
		await hooked(page, ([w]) => {
			for (const n of [60, 64, 67]) w.__piano.noteOn(n, 0.9);
		});
		await page.waitForTimeout(1200);
		await hooked(page, ([w]) => {
			for (const n of [60, 64, 67]) w.__piano.noteOff(n);
		});
		await page.waitForTimeout(1200);
		await device.getByRole("button", { name: "Stop", exact: true }).click();
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 2);
		const peak = await hooked(page, ([w]) => {
			const s = w.__studio;
			return Math.max(...s.sources[s.arrangement.clips[1].sourceId].peaks);
		});
		expect(peak).toBeGreaterThan(0.02);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 30_000,
		});
		// The song now carries the piano's preset: the page data says so after a reload.
		await open(page, "/studio", "__studio");
		const html = await page.evaluate(() => fetch("/studio/__data.json").then((r) => r.text()));
		expect(html).toContain('"piano"');
		await deleteStudioSongs(page);
	});
});
