import { deleteStudioSongs, expect, hooked, open, test, until } from "./fixtures";

/**
 * Studio phase 3 (docs/multitrack-recorder.md): a MIDI track records the
 * notes the hosted piano plays as a clip, plays them back through the
 * piano, quantizes, and renders to an audio track with sound in it. The
 * song is deleted at the end.
 */
test.describe.serial("Studio MIDI", () => {
	test("a MIDI track records the piano's notes, plays them back and renders to audio", async ({
		page,
		errors,
	}) => {
		await open(page, "/studio", "__studio");
		const device = page.getByRole("dialog", { name: "Studio" });
		await deleteStudioSongs(page);
		await page.getByRole("button", { name: "New song" }).click();
		await expect(page.getByLabel("Song title")).not.toHaveValue("");
		await page.getByRole("button", { name: "Add MIDI track" }).click();
		const midi = await hooked(page, ([w]) => {
			const t = w.__studio.arrangement.tracks.find((x: any) => x.kind === "midi");
			return { id: t?.id, name: t?.name, input: t?.input?.source };
		});
		expect(midi.input).toBe("piano");
		// The seeded audio track stays out of it; arming the MIDI track opens its instrument's panel; no count-in so the notes land from the start.
		await page.getByRole("button", { name: /Arm Track 1/ }).click();
		await page.getByRole("button", { name: `Arm ${midi.name}` }).click();
		await expect(page.getByRole("dialog", { name: "Piano" })).toBeVisible();
		await hooked(page, ([w]) => {
			w.__studio.setCountIn(false);
			w.__studio.seek(0);
		});
		await page.mouse.click(700, 300);
		await device.getByRole("button", { name: "Record", exact: true }).click();
		await until(page, ([w]) => w.__studio.phase === "recording");
		await page.waitForTimeout(300);
		// Three notes a quarter second apart, held a quarter second, straight into the hosted engine.
		for (const n of [60, 64, 67]) {
			await hooked(page, ([w, n]) => w.__piano.noteOn(n, 0.9), n);
			await page.waitForTimeout(250);
			await hooked(page, ([w, n]) => w.__piano.noteOff(n), n);
		}
		await page.waitForTimeout(400);
		await device.getByRole("button", { name: "Stop", exact: true }).click();
		await until(page, ([w]) => w.__studio.arrangement.clips.length === 1);
		const clip = await hooked(page, ([w]) => {
			const c = w.__studio.arrangement.clips[0];
			return {
				trackId: c.trackId,
				sourceId: c.sourceId,
				notes: c.notes,
				name: c.name,
				duration: c.duration,
			};
		});
		expect(clip.trackId).toBe(midi.id);
		expect(clip.sourceId).toBeUndefined();
		expect(clip.name).toMatch(/Take 1$/);
		expect(clip.notes.map((n: any) => n.p)).toEqual([60, 64, 67]);
		for (const n of clip.notes) {
			expect(n.d).toBeGreaterThan(0.15);
			expect(n.d).toBeLessThan(0.6);
			expect(n.v).toBeCloseTo(0.9, 1);
		}
		expect(clip.notes[1].t - clip.notes[0].t).toBeGreaterThan(0.15);
		// The lane says what it holds.
		await expect(page.getByRole("button", { name: /Take 1 at .* \(3 notes\)/ })).toBeVisible();

		// Playback: the notes are queued and voices fire through the piano.
		await hooked(page, ([w]) => w.__studio.seek(0));
		await device.getByRole("button", { name: "Play", exact: true }).click();
		await until(page, ([w]) => w.__studio.diagnostics().midiVoices > 0);
		await page.waitForTimeout(1500);
		await device.getByRole("button", { name: "Stop", exact: true }).click();
		await until(page, ([w]) => w.__studio.phase === "idle");
		expect(await hooked(page, ([w]) => w.__studio.diagnostics().midiVoices)).toBe(0);

		// Quantize to the beat (120 bpm: half-second lines) and transpose up an octave.
		await page.getByRole("button", { name: /Take 1 at/ }).click();
		await page.getByRole("button", { name: "Beat" }).click();
		await page.getByRole("button", { name: "Up an octave" }).click();
		const edited = await hooked(page, ([w]) => w.__studio.arrangement.clips[0].notes);
		expect(edited.map((n: any) => n.p)).toEqual([72, 76, 79]);
		for (const n of edited) expect((((n.t * 2) % 1) + 1) % 1).toBeCloseTo(0, 5);

		// Render to audio: a new audio track with a take holding the piano's sound; the MIDI track is muted.
		await page.getByRole("button", { name: `${midi.name} actions` }).click();
		await page.getByRole("button", { name: "Render to audio track" }).click();
		await until(
			page,
			([w]) =>
				w.__studio.arrangement.clips.some((c: any) => c.sourceId) && w.__studio.phase === "idle",
			{ ms: 30_000 },
		);
		const rendered = await hooked(page, ([w]) => {
			const s = w.__studio;
			const audio = s.arrangement.tracks.find((t: any) => t.name.endsWith("(audio)"));
			const c = s.arrangement.clips.find((x: any) => x.sourceId);
			const src = s.sources[c.sourceId];
			return {
				trackName: audio?.name,
				clipTrack: c.trackId === audio?.id,
				midiMuted: s.arrangement.tracks.find((t: any) => t.kind === "midi")?.muted,
				duration: c.duration,
				peak: Math.max(...src.peaks),
			};
		});
		expect(rendered.trackName).toBe(`${midi.name} (audio)`);
		expect(rendered.clipTrack).toBe(true);
		expect(rendered.midiMuted).toBe(true);
		expect(rendered.duration).toBeGreaterThan(1);
		expect(rendered.peak).toBeGreaterThan(0.02);
		await until(page, ([w]) => !Object.values(w.__studio.sources).some((s: any) => s.pending), {
			ms: 30_000,
		});
		// Export: the clip's MIDI file downloads.
		const [download] = await Promise.all([
			page.waitForEvent("download"),
			page.getByRole("button", { name: "Export MIDI" }).click(),
		]);
		expect(download.suggestedFilename()).toMatch(/\.mid$/);
		expect(errors).toEqual([]);
		await deleteStudioSongs(page);
	});
});
