import path from "node:path";
import { deleteStudioSongs, expect, hooked, open, test, until } from "./fixtures";

/**
 * Scale in Dawn (docs/dawn-daw-plan.md, D8): a recording no clip plays
 * stays cold after a reload (listed, not decoded) and comes in when the
 * library plays it; a track freezes into one rendering with its inserts
 * put away and thaws back; memory can be freed by hand. The bot's songs
 * are deleted at the end.
 */
test.describe("Dawn scale", () => {
	test("cold sources load on demand; a track freezes and thaws", async ({ page, errors }) => {
		test.setTimeout(180_000);
		await open(page, "/multitrack-recorder", "__studio");
		await deleteStudioSongs(page);
		await page.getByRole("button", { name: "New song" }).click();
		await expect(page.getByLabel("Song title")).not.toHaveValue("");
		await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0);
		const file = path.resolve("static/stems/keys.wav");
		await hooked(page, ([w]) => w.__studio.seek(0));
		await page.locator("input[type=file]").setInputFiles(file);
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
		// A second recording, then its clip removed: the recording stays with the song, played by nothing.
		await hooked(page, ([w]) => w.__studio.seek(25));
		await page.locator("input[type=file]").setInputFiles(file);
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 2);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});
		const spare = await hooked(page, ([w]) => w.__studio.arrangement.clips[1].sourceId);
		await hooked(page, ([w]) => w.__studio.deleteClip(w.__studio.arrangement.clips[1].id));
		await expect(page.getByText("unsaved", { exact: true })).toBeVisible();
		await expect(page.getByText("saved", { exact: true })).toBeVisible({ timeout: 15_000 });
		// Unload by hand: the spare goes cold, the played one stays.
		await page.getByRole("button", { name: "Song actions" }).click();
		await page.getByRole("button", { name: "Unload recordings nothing plays" }).click();
		await expect(page.getByText(/Unloaded 1 recording/)).toBeVisible();
		expect(await hooked(page, ([w, id]) => w.__studio.sources[id].status, spare)).toBe("cold");
		expect(
			await hooked(
				page,
				([w]) => w.__studio.bufferOf(w.__studio.arrangement.clips[0].sourceId) !== null,
			),
		).toBe(true);

		// After a reload only the played recording decodes; the library plays the cold one, which comes in for it.
		await open(page, "/multitrack-recorder", "__studio");
		await until(
			page,
			([w]) => w.__studio.decoding === 0 && w.__studio.arrangement.clips.length === 1,
			{ ms: 30_000 },
		);
		const statuses = await hooked(page, ([w]) =>
			Object.values(w.__studio.sources)
				.map((s: any) => s.status as string)
				.sort((a, b) => a.localeCompare(b)),
		);
		expect(statuses).toEqual(["cold", "ready"]);
		await page.getByRole("button", { name: "Library" }).click();
		const library = page.locator("[data-library-panel]");
		await expect(library).toContainText("on the server");
		await library
			.getByRole("button", { name: /^Play keys/ })
			.nth(1)
			.click();
		await until(page, ([w, id]) => w.__studio.sources[id].status === "ready", {
			arg: spare,
			ms: 30_000,
		});
		await library.getByRole("button", { name: /^Stop keys/ }).click();
		await page.getByRole("button", { name: "Close Library" }).click();

		// Freeze: an EQ on the track, then one rendering stands in for the clip and the inserts; thaw brings both back.
		await hooked(page, ([w]) => {
			const s = w.__studio;
			const t = s.arrangement.tracks[0];
			s.setInserts(t.id, [{ id: "eq1", kind: "eq", settings: { lowGain: 6 } }]);
		});
		const trackName = await hooked(page, ([w]) => w.__studio.arrangement.tracks[0].name);
		await page
			.locator("[data-track-row]")
			.first()
			.getByRole("button", { name: `${trackName} actions` })
			.click();
		await page.getByRole("button", { name: "Freeze track" }).click();
		await expect(page.getByRole("img", { name: `${trackName} is frozen` })).toBeVisible({
			timeout: 30_000,
		});
		const frozen = await hooked(page, ([w]) => {
			const s = w.__studio;
			const t = s.arrangement.tracks[0];
			return {
				inserts: t.inserts ?? null,
				kept: t.frozen.clips.length,
				keptInserts: t.frozen.inserts?.length ?? 0,
				clips: s.arrangement.clips.filter((c: any) => c.trackId === t.id).map((c: any) => c.name),
			};
		});
		expect(frozen.inserts).toBeNull();
		expect(frozen.kept).toBe(1);
		expect(frozen.keptInserts).toBe(1);
		expect(frozen.clips).toEqual([`${trackName} (frozen)`]);
		await expect(page.getByRole("button", { name: `${trackName} Inserts` })).toBeDisabled();
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 60_000,
		});
		await page
			.locator("[data-track-row]")
			.first()
			.getByRole("button", { name: `${trackName} actions` })
			.click();
		await page.getByRole("button", { name: "Unfreeze track" }).click();
		await expect(page.getByRole("img", { name: `${trackName} is frozen` })).toHaveCount(0);
		const thawed = await hooked(page, ([w]) => {
			const s = w.__studio;
			const t = s.arrangement.tracks[0];
			return {
				inserts: t.inserts?.length ?? 0,
				clips: s.arrangement.clips.filter((c: any) => c.trackId === t.id).map((c: any) => c.name),
			};
		});
		expect(thawed.inserts).toBe(1);
		expect(thawed.clips).toEqual(["keys"]);
		expect(errors).toEqual([]);
		await deleteStudioSongs(page);
	});
});
