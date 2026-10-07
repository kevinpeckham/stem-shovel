import path from "node:path";
import { deleteStudioSongs, expect, hooked, open, test, until } from "./fixtures";

/**
 * The Studio (docs/multitrack-recorder.md) end to end with the fake
 * microphone: a take lands as a clip and uploads; an import, trims, a
 * split, fades, gain and a duplicate; a loop recording's takes and a punch;
 * a reload brings everything back; a named revision restores. The bot's
 * songs are deleted through the app at the end.
 */
test.describe.serial("Studio", () => {
	test("records a take that lands as a clip and uploads", async ({ page, errors }) => {
		await open(page, "/studio", "__studio");
		await deleteStudioSongs(page);
		await page.getByRole("button", { name: "New song" }).click();
		await expect(page.getByLabel("Song title")).not.toHaveValue("");
		// The seeded track is armed to the microphone; the count-in is off for a shorter test.
		await hooked(page, ([w]) => w.__studio.setCountIn(false));
		await page.getByRole("button", { name: "Record", exact: true }).click();
		await until(page, ([w]) => w.__studio.phase === "recording");
		await page.waitForTimeout(3000);
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
		const clip = await hooked(page, ([w]) => w.__studio.arrangement.clips[0]);
		expect(clip.start).toBe(0);
		expect(clip.duration).toBeGreaterThan(2.5);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 30_000,
		});
		await expect(page.locator("header").getByText(/saved/)).toBeVisible();
		expect(errors).toEqual([]);
	});

	test("imports a file, trims, splits, fades, duplicates, and keeps it all through a reload", async ({
		page,
	}) => {
		await open(page, "/studio", "__studio");
		await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0);
		await hooked(page, ([w]) => w.__studio.seek(5));
		await page.locator("input[type=file]").setInputFiles(path.resolve("static/stems/keys.wav"));
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 2);
		const clips = () =>
			hooked(page, ([w]) =>
				w.__studio.arrangement.clips.map((c: any) => ({
					s: +c.start.toFixed(2),
					o: +c.offset.toFixed(2),
					d: +c.duration.toFixed(2),
					g: c.gain,
					fi: c.fadeIn,
					fo: c.fadeOut,
				})),
			);
		expect((await clips())[1]).toMatchObject({ s: 5, o: 0, d: 20 });
		// Trim the right edge in by 2 s and the left edge by 1 s (40 px/s at the default zoom).
		const imported = page.locator("[data-clip]").nth(1);
		let box = (await imported.boundingBox())!;
		await page.mouse.move(box.x + box.width - 3, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + box.width - 83, box.y + box.height / 2, { steps: 6 });
		await page.mouse.up();
		box = (await imported.boundingBox())!;
		await page.mouse.move(box.x + 3, box.y + box.height / 2);
		await page.mouse.down();
		await page.mouse.move(box.x + 43, box.y + box.height / 2, { steps: 6 });
		await page.mouse.up();
		expect((await clips())[1]).toMatchObject({ s: 6, o: 1, d: 17 });
		// Split at 8 s: S with the clip selected.
		await imported.click();
		await hooked(page, ([w]) => w.__studio.seek(8));
		await page.keyboard.press("s");
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 3);
		expect((await clips()).slice(1)).toEqual([
			{ s: 6, o: 1, d: 2, g: 1, fi: 0, fo: 0 },
			{ s: 8, o: 3, d: 15, g: 1, fi: 0, fo: 0 },
		]);
		await page.getByLabel("Fade in, seconds").fill("0.5");
		await page.getByLabel("Fade in, seconds").press("Tab");
		await page.getByLabel("Clip gain").fill("0.5");
		await page.keyboard.press("Meta+d");
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 4);
		expect((await clips())[3]).toMatchObject({ s: 23, o: 3, d: 15, g: 0.5, fi: 0.5 });
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});
		await until(page, ([w]) => !w.__studio.dirty, { ms: 10_000 });
		await open(page, "/studio", "__studio");
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 4);
		await until(page, ([w]) => w.__studio.decoding === 0, { ms: 30_000 });
		expect(
			await hooked(page, ([w]) => Object.values(w.__studio.sources).map((s: any) => s.status)),
		).toEqual(["ready", "ready"]);
	});

	test("a loop recording makes a take per pass; punch keeps the region; a revision restores", async ({
		page,
	}) => {
		await open(page, "/studio", "__studio");
		await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0);
		await page.getByRole("button", { name: "Add track" }).click();
		await page.getByRole("button", { name: /Arm Track 1/ }).click(); // disarm
		await page.getByRole("button", { name: /Arm Track 2/ }).click();
		await hooked(page, ([w]) => {
			w.__studio.setLoop({ on: true, start: 0, end: 2 });
			w.__studio.setCountIn(false);
			w.__studio.seek(0);
		});
		const before = await hooked(page, ([w]) => w.__studio.arrangement.clips.length);
		await page.getByRole("button", { name: "Record", exact: true }).click();
		await page.waitForTimeout(5300);
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await until(page, ([w, n]) => w.__studio.arrangement.clips.length === n + 1, { arg: before });
		const loopClip = await hooked(page, ([w]) => w.__studio.arrangement.clips.at(-1));
		expect(loopClip).toMatchObject({ start: 0, duration: 2 });
		expect(loopClip.alternates).toHaveLength(1);
		expect(loopClip.name).toMatch(/Take \d+\.2$/);
		// Punch: loop off, punch on, record from 0.5 s → the clip holds 0.5..2 only.
		await hooked(page, ([w]) => {
			w.__studio.toggleLoop();
			w.__studio.setPunch(true);
			w.__studio.seek(0.5);
		});
		await page.getByRole("button", { name: "Record", exact: true }).click();
		await page.waitForTimeout(3000);
		await page.getByRole("button", { name: "Stop", exact: true }).click();
		await until(page, ([w, n]) => w.__studio.arrangement.clips.length === n + 2, { arg: before });
		expect(await hooked(page, ([w]) => w.__studio.arrangement.clips.at(-1))).toMatchObject({
			start: 0.5,
			duration: 1.5,
		});
		// A named revision, then an edit, then the restore brings the named state back.
		page.once("dialog", (d) => d.accept("Keeper"));
		await page.getByRole("button", { name: "Song actions" }).click();
		await page.getByRole("button", { name: "Save revision…" }).click();
		await expect(page.locator("section[aria-label=Songs]").getByText("Keeper")).toBeVisible();
		const kept = await hooked(page, ([w]) => w.__studio.arrangement.clips.length);
		await hooked(page, ([w]) => w.__studio.deleteClip(w.__studio.arrangement.clips[0].id));
		expect(await hooked(page, ([w]) => w.__studio.arrangement.clips.length)).toBe(kept - 1);
		page.once("dialog", (d) => d.accept());
		await page
			.locator("section[aria-label=Songs] li li", { hasText: "Keeper" })
			.getByRole("button", { name: "Restore" })
			.click();
		await until(page, ([w, n]) => w.__studio.arrangement.clips.length === n, { arg: kept });
	});

	test("cleans up the bot's songs", async ({ page, errors }) => {
		await open(page, "/studio", "__studio");
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});
		await deleteStudioSongs(page);
		expect(await page.locator("section[aria-label=Songs] li > details").count()).toBe(0);
		expect(errors).toEqual([]);
	});
});
