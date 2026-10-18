import { deleteStudioSongs, expect, hooked, open, test, until } from "./fixtures";

/**
 * Dawn's mixer (docs/dawn-daw-plan.md, D2): the Mixer view adds a bus,
 * routes a track to it, sets a send, adds an EQ insert whose slider
 * writes a setting, an automation lane drives the insert's parameter,
 * the whole graph plays, and the bounce renders through it. The bot's
 * songs are deleted at the end.
 */
test.describe("Dawn mixer", () => {
	test("a bus, a route, a send, an insert, a lane on its parameter, playback and a bounce", async ({
		page,
		errors,
	}) => {
		await open(page, "/multitrack-recorder", "__studio");
		const addTrack = page.getByRole("button", { name: "Add track", exact: true });
		await expect(addTrack).toBeVisible({ timeout: 60_000 });
		await addTrack.click();
		const trackId = await hooked(page, ([w]) => w.__studio.arrangement.tracks[0].id);

		// The Mixer view: a strip for the track and the master; Add bus makes a third.
		await page.getByRole("button", { name: "Mixer", exact: true }).click();
		const console_ = page.getByRole("group", { name: "Mixer" });
		await expect(console_.getByRole("region", { name: "Master strip" })).toBeVisible();
		await console_.getByRole("button", { name: "Add bus" }).click();
		await expect(console_.getByRole("region", { name: "Bus 1 bus strip" })).toBeVisible();
		const busId = await hooked(page, ([w]) => w.__studio.arrangement.buses[0].id);
		expect(await hooked(page, ([w]) => w.__studio.diagnostics().buses)).toEqual([busId]);

		// The track's output goes to the bus; a send to it too (the knob is a slider).
		await console_.getByRole("combobox", { name: "Track 1 output" }).click();
		await page.getByRole("option", { name: "Bus 1" }).click();
		expect(await hooked(page, ([w]) => w.__studio.arrangement.tracks[0].output)).toBe(busId);
		await hooked(page, ([w, arg]) => w.__studio.setSend(arg.trackId, arg.busId, 0.5), {
			trackId,
			busId,
		});
		await expect(console_.getByRole("slider", { name: "Track 1 send to Bus 1" })).toHaveAttribute(
			"aria-valuenow",
			"0.5",
		);

		// An EQ insert on the track; its Low slider writes the setting.
		await console_.getByRole("button", { name: "Track 1 inserts" }).click();
		await page.getByRole("button", { name: "Add EQ" }).click();
		await until(page, ([w]) => w.__studio.arrangement.tracks[0].inserts?.length === 1, {
			ms: 5_000,
		});
		await page.getByRole("slider", { name: "EQ Low", exact: true }).fill("3");
		const insert = await hooked(page, ([w]) => w.__studio.arrangement.tracks[0].inserts[0]);
		expect(insert.kind).toBe("eq");
		expect(insert.settings.lowGain).toBe(3);
		await page.keyboard.press("Escape");

		// Back on the tracks, the lane picker offers the insert's parameter; a click on the lane makes a point for it.
		await page.getByRole("button", { name: "Tracks", exact: true }).click();
		const track = page.locator("[data-track-row]").first();
		await track.getByRole("button", { name: /^Automation for/ }).click();
		await track.getByRole("combobox", { name: "Track 1 automation parameter" }).click();
		await page.getByRole("option", { name: "EQ: Low" }).click();
		const lane = page.locator("[data-automation-lane]").first();
		const box = (await lane.boundingBox())!;
		await page.mouse.click(box.x + 50, box.y + 8);
		const laneKey = `insert:${insert.id}:lowGain`;
		await until(
			page,
			([w, key]) => (w.__studio.arrangement.tracks[0].automation?.[key]?.length ?? 0) === 1,
			{ arg: laneKey, ms: 5_000 },
		);
		expect(
			await hooked(
				page,
				([w, key]) => w.__studio.hasAutomation(w.__studio.arrangement.tracks[0].id, key),
				laneKey,
			),
		).toBe(true);

		// The graph plays through the bus, the send and the insert.
		await hooked(page, ([w]) => {
			w.__studio.setLoop({ on: true, start: 0, end: 4 });
			void w.__studio.play({ countIn: false });
		});
		await until(page, ([w]) => w.__studio.position > 0.5, { ms: 10_000 });
		await hooked(page, ([w]) => {
			w.__studio.stop(0);
			w.__studio.setLoop(null);
		});

		// The bounce builds the same strips offline and renders.
		const rendered = await hooked(page, async ([w]) => {
			const buffer = await w.__studio.render();
			return { length: buffer.length, channels: buffer.numberOfChannels };
		});
		expect(rendered.channels).toBe(2);
		expect(rendered.length).toBeGreaterThan(0);

		// Remove bus: the track returns to the master and the send goes.
		await page.getByRole("button", { name: "Mixer", exact: true }).click();
		await console_.getByRole("button", { name: "Bus 1 actions" }).click();
		await page.getByRole("button", { name: "Remove bus" }).click();
		await until(page, ([w]) => (w.__studio.arrangement.buses?.length ?? 0) === 0, { ms: 5_000 });
		const after = await hooked(page, ([w]) => w.__studio.arrangement.tracks[0]);
		expect(after.output).toBeUndefined();
		expect(after.sends ?? []).toEqual([]);
		await deleteStudioSongs(page);
		expect(errors).toEqual([]);
	});
});
