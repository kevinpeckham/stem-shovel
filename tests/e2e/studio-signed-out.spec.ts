import { test as base, expect } from "@playwright/test";
import { deleteStudioSongs, until, type Hooked } from "./fixtures";

/**
 * Dawn signed out (docs/multitrack-recorder.md, "Signed out" and "Into
 * the account"): a visitor records a take, names the song, downloads the
 * mix as an MP3 encoded in the browser, reloads and finds the song back
 * from IndexedDB; then signs in as the bot in the same browser, is offered
 * the kept song, saves it to the account (the take uploads), and the song
 * is deleted at the end.
 */
const test = base.extend<{ errors: string[] }>({
	// oxlint-disable-next-line no-empty-pattern
	errors: async ({}, use) => {
		await use([]);
	},
});

test("a visitor's song is kept in the browser, exports an MP3, and goes into the account after sign-in", async ({
	page,
	context,
	baseURL,
	errors,
}) => {
	test.setTimeout(240_000);
	const token = process.env.PREVIEW_AUTH_TOKEN;
	test.skip(!token, "PREVIEW_AUTH_TOKEN is not set: run through varlock on the dev VM");
	page.on("pageerror", (e) => errors.push(e.message.slice(0, 300)));

	// Signed out: the page opens, with the notice that the song lives here.
	await page.goto("/multitrack-recorder", { waitUntil: "networkidle" });
	await page.waitForFunction(() => !!(window as unknown as Hooked).__studio);
	await expect(page.locator("[data-local-notice]")).toContainText("kept in this browser");
	await expect(page.locator("[data-local-recordings]")).toBeVisible();
	await page.getByLabel("Song title").fill("Kept song");
	await page.getByLabel("Song title").press("Enter");
	await page.evaluate(() => (window as unknown as Hooked).__studio.setCountIn(false));
	await page.getByRole("button", { name: "Record", exact: true }).click();
	await until(page, ([w]) => w.__studio.phase === "recording");
	await page.waitForTimeout(2500);
	await page.getByRole("button", { name: "Stop", exact: true }).click();
	await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
	await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending));

	// The mix as an MP3, encoded in the browser: a real MPEG frame or an ID3 tag at the start.
	await page.getByRole("button", { name: "Song actions", exact: true }).click();
	const download = page.waitForEvent("download");
	await page.getByRole("button", { name: "Download mix (MP3)" }).click();
	const file = await download;
	expect(file.suggestedFilename()).toBe("Kept song.mp3");
	const stream = await file.createReadStream();
	const head = await new Promise<Buffer>((resolve) => {
		const chunks: Buffer[] = [];
		stream.on("data", (c: Buffer) => chunks.push(c));
		stream.on("end", () => resolve(Buffer.concat(chunks)));
	});
	expect(head.length).toBeGreaterThan(1000);
	const id3 = head.subarray(0, 3).toString() === "ID3";
	const frame = head[0] === 0xff && (head[1]! & 0xe0) === 0xe0;
	expect(id3 || frame).toBe(true);

	// A reload: the song comes back from the browser, title, clip and audio.
	await page.waitForTimeout(800);
	await page.reload({ waitUntil: "networkidle" });
	await page.waitForFunction(() => !!(window as unknown as Hooked).__studio);
	await until(page, ([w]) => w.__studio.arrangement.clips.length === 1, { ms: 20_000 });
	await expect(page.getByLabel("Song title")).toHaveValue("Kept song");
	await expect(page.locator("[data-local-notice]")).toContainText("Back from last time");
	await until(
		page,
		([w]) => Object.values(w.__studio.sources).every((s: any) => s.status === "ready"),
		{
			ms: 30_000,
		},
	);

	// Signed in (the bot) in the same browser: the kept song is offered and saved to the account.
	await context.addCookies([{ name: "preview_token", value: token!, url: baseURL! }]);
	await page.goto("/multitrack-recorder", { waitUntil: "networkidle" });
	await page.waitForFunction(() => !!(window as unknown as Hooked).__studio);
	const offer = page.locator("[data-kept-offer]");
	await expect(offer).toContainText("Kept song");
	await expect(offer).toContainText("1 recording");
	await offer.getByRole("button", { name: /^Save to / }).click();
	await expect(offer).toHaveCount(0, { timeout: 30_000 });
	await expect(page.getByLabel("Song title")).toHaveValue("Kept song");
	await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
	await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
		ms: 60_000,
	});
	await expect(page.locator("header").getByText(/saved/)).toBeVisible();
	// The upload finishes before the reload (a reload mid-upload resumes it, which is another test's matter).
	await expect(page.getByText(/uploading \d/)).toHaveCount(0, { timeout: 90_000 });
	// Nothing kept remains; a reload shows no offer.
	await page.reload({ waitUntil: "networkidle" });
	await page.waitForFunction(() => !!(window as unknown as Hooked).__studio);
	await expect(page.locator("[data-kept-offer]")).toHaveCount(0);
	await deleteStudioSongs(page);
	expect(errors).toEqual([]);
});
