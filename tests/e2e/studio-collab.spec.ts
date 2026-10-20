import { deleteStudioSongs, newStudioSong, expect, hooked, open, test, until } from "./fixtures";

/**
 * Collaboration in Dawn (docs/dawn-daw-plan.md, D7): a song shared with
 * the band from its menu, a comment pinned to the playhead that lands in
 * the thread and on the ruler, a notification's deep link that opens the
 * song with its Comments panel, a revision compared with now, and two
 * browsers on one song where the second's save makes the first reload
 * rather than overwrite. The bot's songs are deleted at the end.
 */
test.describe("Dawn collaboration", () => {
	test("shares, comments, compares and reloads on a conflict", async ({
		page,
		context,
		errors,
	}) => {
		test.setTimeout(180_000);
		await open(page, "/multitrack-recorder", "__studio");
		await deleteStudioSongs(page);
		await newStudioSong(page);
		await until(page, ([w]) => w.__studio.arrangement.tracks.length > 0);
		// Something to save: a second track; the autosave lands and becomes the base.
		await page.getByRole("button", { name: "Add track", exact: true }).click();
		// "unsaved" while the autosave waits, "saved" once it landed.
		await expect(page.getByText("unsaved", { exact: true })).toBeVisible();
		await expect(page.getByText("saved", { exact: true })).toBeVisible({ timeout: 15_000 });
		const songId = await hooked(page, () => localStorage.getItem("stemshovel.studio.last-song"));
		expect(songId).toBeTruthy();

		// Share with the band from the song's menu; the list says so.
		await page.getByRole("button", { name: "Song actions" }).click();
		await page.getByRole("button", { name: "Share with the band" }).click();
		await expect(page.getByText(/Shared with the band/)).toBeVisible();
		await page.getByRole("button", { name: "Song actions" }).click();
		await expect(page.getByRole("button", { name: "Stop sharing with the band" })).toBeVisible();
		await page.keyboard.press("Escape");

		// A comment pinned at 3 s: in the thread with the author, and a dot on the ruler that seeks there.
		await hooked(page, ([w]) => w.__studio.seek(3));
		await page.getByRole("button", { name: /^Comments/ }).click();
		await page.getByRole("textbox", { name: "Comment" }).fill("Too loud here");
		await page.getByRole("button", { name: "Post" }).click();
		const thread = page.getByRole("list", { name: "Comments" });
		await expect(thread).toContainText("Too loud here");
		await expect(thread).toContainText("at 0:03.0");
		await hooked(page, ([w]) => w.__studio.seek(0));
		await page.getByRole("button", { name: /^Comment by .* at 0:03\.0$/ }).click();
		expect(await hooked(page, ([w]) => w.__studio.position)).toBeCloseTo(3, 2);
		await page.getByRole("button", { name: /^Close Comments/ }).click();

		// A named revision, then a change: Compare says what differs from now.
		page.once("dialog", (d) => d.accept("Before the bass"));
		await page.getByRole("button", { name: "Song actions" }).click();
		await page.getByRole("button", { name: "Save revision…" }).click();
		await expect(page.getByText(/Revision .* saved/)).toBeVisible();
		await page.getByRole("button", { name: "Add MIDI track" }).click();
		await until(page, ([w]) => w.__studio.arrangement.tracks.length === 3);
		// This browser's save lands before the other opens, so the other starts from the newest.
		await expect(page.getByText("unsaved", { exact: true })).toBeVisible();
		await expect(page.getByText("saved", { exact: true })).toBeVisible({ timeout: 15_000 });
		const songRow = page.locator("section[aria-label=Recordings] li > details").first();
		await songRow.getByRole("button", { name: "Compare" }).first().click();
		await expect(songRow).toContainText(/Track .* added/);

		// A second browser on the same song saves; the first's next save sees it and reloads rather than overwrite.
		const other = await context.newPage();
		await open(other, `/multitrack-recorder?song=${songId}&open=comments`, "__studio");
		await expect(other.getByRole("list", { name: "Comments" })).toContainText("Too loud here");
		await other.getByRole("button", { name: "Add track", exact: true }).click();
		await expect(other.getByText("unsaved", { exact: true })).toBeVisible();
		await expect(other.getByText("saved", { exact: true })).toBeVisible({ timeout: 15_000 });
		await other.close();
		await hooked(page, ([w]) => w.__studio.setGain(w.__studio.arrangement.tracks[0].id, 0.5));
		await expect(page.getByText(/Someone else saved this song/)).toBeVisible({ timeout: 15_000 });
		await until(page, ([w]) => w.__studio.arrangement.tracks.length === 4, { ms: 15_000 });
		expect(errors).toEqual([]);
		await deleteStudioSongs(page);
	});
});
