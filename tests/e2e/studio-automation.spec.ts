import { deleteStudioSongs, expect, hooked, open, test, until } from "./fixtures";

/**
 * Automation in Dawn (docs/dawn-daw-plan.md, D1): the A button opens a
 * lane under a track's clips, two clicks make two points the arrangement
 * keeps, the volume knob then reads the curve as the playhead passes,
 * turning it writes a point at the playhead, and the lane goes with
 * Delete. The bot's songs are deleted at the end.
 */
test.describe("Dawn automation", () => {
	test("draws a volume lane, plays through it and writes from the knob", async ({
		page,
		errors,
	}) => {
		await open(page, "/multitrack-recorder", "__studio");
		const addTrack = page.getByRole("button", { name: "Add track", exact: true });
		await expect(addTrack).toBeVisible({ timeout: 60_000 });
		await addTrack.click();
		const track = page.locator("[data-track-row]").first();
		await track.getByRole("button", { name: /^Automation for/ }).click();
		const lane = page.locator("[data-automation-lane]").first();
		await expect(lane).toBeVisible();
		const box = (await lane.boundingBox())!;
		// Two points: near the start low, two seconds in high (the lane snaps to the beat at 120 bpm).
		await page.mouse.click(box.x + 10, box.y + box.height - 8);
		await page.mouse.click(box.x + 90, box.y + 8);
		await until(
			page,
			([w]) => (w.__studio.arrangement.tracks[0].automation?.volume?.length ?? 0) === 2,
			{ ms: 5_000 },
		);
		const lanePoints = await hooked(
			page,
			([w]) => w.__studio.arrangement.tracks[0].automation.volume,
		);
		expect(lanePoints[0].v).toBeLessThan(lanePoints[1].v);
		// The knob reads the curve: at the start the low value, past the second point the high one.
		const atStart = await hooked(page, ([w]) =>
			w.__studio.automatedValue(w.__studio.arrangement.tracks[0].id, "volume", 0),
		);
		const later = await hooked(page, ([w]) =>
			w.__studio.automatedValue(w.__studio.arrangement.tracks[0].id, "volume", 10),
		);
		expect(atStart).toBeCloseTo(lanePoints[0].v, 3);
		expect(later).toBeCloseTo(lanePoints[1].v, 3);
		// Turning the knob with a lane open writes a point at the playhead instead of the fader.
		await hooked(page, ([w]) => {
			w.__studio.seek(1);
			w.__studio.setGain(w.__studio.arrangement.tracks[0].id, 0.25);
		});
		const after = await hooked(page, ([w]) => w.__studio.arrangement.tracks[0]);
		expect(after.automation.volume).toHaveLength(3);
		expect(after.automation.volume.find((p: { t: number }) => p.t === 1)?.v).toBe(0.25);
		expect(after.gain).toBe(1);
		// Undo takes the write back as one step.
		await page.keyboard.press("ControlOrMeta+z");
		expect(
			await hooked(page, ([w]) => w.__studio.arrangement.tracks[0].automation.volume.length),
		).toBe(2);
		// The lane plays: with nothing to play the transport would park at once, so a loop keeps it running.
		await hooked(page, ([w]) => {
			w.__studio.setLoop({ on: true, start: 0, end: 4 });
			void w.__studio.play({ countIn: false });
		});
		await until(page, ([w]) => w.__studio.position > 0.5, { ms: 10_000 });
		await hooked(page, ([w]) => {
			w.__studio.stop(0);
			w.__studio.setLoop(null);
		});
		// A point goes with Delete from its handle; the lane hides again with A.
		await page.getByRole("button", { name: /Volume point 1/ }).focus();
		await page.keyboard.press("Delete");
		expect(
			await hooked(page, ([w]) => w.__studio.arrangement.tracks[0].automation.volume.length),
		).toBe(1);
		await track.getByRole("button", { name: /^Automation for/ }).click();
		await expect(lane).toHaveCount(0);
		await deleteStudioSongs(page);
		expect(errors).toEqual([]);
	});
});
