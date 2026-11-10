import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { barGrid } from "#lib/audio/measures.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";

/** The settings' tempo, key and time signature rows: the save is a stand-in, notifications are recorded. */
const saveChanges = vi.hoisted(() =>
	vi.fn<(args: { id: string; changes: SongChange[] }) => Promise<void>>(async () => {}),
);
vi.mock("#lib/remote/songs.remote.js", () => ({ saveChanges }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { SongChanges, POSITION_PLACEHOLDER } = await import("./songChanges.svelte");

function make(changes: SongChange[], grid = false) {
	const song = { id: "song1", changes };
	const onsaved = vi.fn(async () => {});
	const ctx = { fps: 25, grid: grid ? barGrid(changes, null) : null };
	const sc = new SongChanges({ song: () => song, posCtx: () => ctx, onsaved });
	return { sc, song, onsaved };
}

beforeEach(() => {
	saveChanges.mockClear();
	notify.mockClear();
});

describe("SongChanges", () => {
	test("reset fills the rows from the song, in the readout's format", () => {
		const { sc } = make([{ kind: "tempo", start: 0, value: "120" }]);
		expect(sc.mode).toBe("timecode");
		sc.reset();
		expect(sc.rows).toEqual([
			{
				time: "00:00:00.00",
				shown: "00:00:00.00",
				seconds: 0,
				kind: "tempo",
				value: "120",
				unit: "bottom",
			},
		]);
		expect(POSITION_PLACEHOLDER[sc.mode]).toBe("00:00:00.00");
	});

	test("Add change starts the first row at the top and later ones empty; Remove drops one", () => {
		const { sc } = make([]);
		sc.add();
		sc.add();
		expect(sc.rows.map((r) => r.time)).toEqual(["00:00:00.00", ""]);
		expect(sc.rows.every((r) => r.kind === "tempo")).toBe(true);
		sc.remove(0);
		expect(sc.rows.map((r) => r.time)).toEqual([""]);
	});

	test("a row that is not a position or not a value is named and nothing is saved", async () => {
		const { sc } = make([]);
		sc.rows = [{ time: "soon", shown: "", seconds: null, kind: "tempo", value: "120" }];
		await sc.save();
		expect(sc.error).toBe(
			'"soon" is not a position (time 1:23.4, timecode 01:23:15.72, or bars 12|3).',
		);
		sc.rows = [{ time: "12|1", shown: "", seconds: null, kind: "tempo", value: "120" }];
		await sc.save();
		expect(sc.error).toMatch(/^"12\|1" is in bars, but bars need a tempo and a time signature/);
		sc.rows = [{ time: "0:00.0", shown: "", seconds: null, kind: "tempo", value: "fast" }];
		await sc.save();
		expect(sc.error).toMatch(/^Tempo at 0:00\.0: /);
		expect(saveChanges).not.toHaveBeenCalled();
	});

	test("save keeps an untouched row's exact seconds, refreshes and says so", async () => {
		const { sc, onsaved } = make([
			{ kind: "tempo", start: 0, value: "120" },
			{ kind: "meter", start: 0, value: "4/4" },
		]);
		sc.reset();
		sc.rows.push({ time: "1:00.0", shown: "", seconds: null, kind: "key", value: " D " });
		await sc.save();
		expect(saveChanges).toHaveBeenCalledWith({
			id: "song1",
			changes: [
				{ kind: "tempo", start: 0, value: "120" },
				{ kind: "meter", start: 0, value: "4/4" },
				{ kind: "key", start: 60, value: "D" },
			],
		});
		expect(onsaved).toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith("Tempo, key and time signature saved");
		expect(sc.error).toBeNull();
		expect(sc.saving).toBe(false);
		// Back to what the song holds (the stand-in's data did not change).
		expect(sc.rows).toHaveLength(2);
	});

	test("bars read on a song with a grid", () => {
		const { sc } = make(
			[
				{ kind: "tempo", start: 0, value: "120" },
				{ kind: "meter", start: 0, value: "4/4" },
			],
			true,
		);
		expect(sc.mode).toBe("bars");
		expect(sc.editPos(2)).toBe("2 | 1");
		expect(sc.rowSeconds({ time: "3|1", shown: "", seconds: null })).toBe(4);
	});

	test("a failed save shows the error on the rows", async () => {
		saveChanges.mockRejectedValueOnce(new Error("Turso said no"));
		const { sc, onsaved } = make([]);
		sc.rows = [{ time: "0:00.0", shown: "", seconds: null, kind: "tempo", value: "100" }];
		await sc.save();
		expect(sc.error).toBe("Turso said no");
		expect(onsaved).not.toHaveBeenCalled();
	});

	test("in a compound meter a tempo row offers its units; the meter row wins a tie at 0:00", () => {
		const { sc } = make([
			{ kind: "tempo", start: 0, value: "120" },
			{ kind: "meter", start: 0, value: "6/8" },
			{ kind: "tempo", start: 30, value: "100" },
			{ kind: "meter", start: 20, value: "4/4" },
		]);
		sc.reset();
		expect(sc.unitLabels(sc.rows[0]!)).toEqual({
			bottom: "eighth notes",
			dotted: "dotted quarters",
		});
		expect(sc.unitLabels(sc.rows[1]!)).toBeNull();
		expect(sc.unitLabels(sc.rows[2]!)).toBeNull();
		expect(sc.unitHint).toBe(
			"In 6/8 the tempo counts eighth notes: 120 is 40 dotted quarters a minute. Pick the unit you count in.",
		);
		sc.rows[1]!.value = "6/16";
		expect(sc.unitHint).toMatch(
			/^In 6\/16 the tempo counts sixteenth notes: 120 is 40 dotted eighths/,
		);
		sc.rows[1]!.value = "3/4";
		expect(sc.unitHint).toBeNull();
		expect(sc.unitLabels(sc.rows[0]!)).toBeNull();
	});

	test("save converts a dotted tempo to the bottom note, exactly; a simple meter ignores the unit", async () => {
		const { sc } = make([
			{ kind: "tempo", start: 0, value: "40" },
			{ kind: "meter", start: 0, value: "6/8" },
			{ kind: "tempo", start: 60, value: "40.5" },
			{ kind: "tempo", start: 70, value: "40.1" },
		]);
		sc.reset();
		for (const row of sc.rows) row.unit = "dotted";
		await sc.save();
		expect(saveChanges).toHaveBeenLastCalledWith({
			id: "song1",
			changes: [
				{ kind: "tempo", start: 0, value: "120" },
				{ kind: "meter", start: 0, value: "6/8" },
				{ kind: "tempo", start: 60, value: "121.5" },
				{ kind: "tempo", start: 70, value: "120.3" },
			],
		});

		sc.reset();
		sc.rows[1]!.value = "4/4";
		sc.rows[0]!.unit = "dotted";
		await sc.save();
		expect(saveChanges.mock.lastCall?.[0].changes[0]).toEqual({
			kind: "tempo",
			start: 0,
			value: "40",
		});
	});

	test("a dotted tempo is checked as typed, then as converted", async () => {
		const { sc } = make([
			{ kind: "tempo", start: 0, value: "fast" },
			{ kind: "meter", start: 0, value: "6/8" },
		]);
		sc.reset();
		sc.rows[0]!.unit = "dotted";
		await sc.save();
		expect(sc.error).toMatch(/^Tempo at 00:00:00\.00: Tempo is a number/);
		sc.rows[0]!.value = "150";
		await sc.save();
		expect(sc.error).toBe(
			"Tempo at 00:00:00.00: 150 dotted quarters is 450. Tempo is a number between 20 and 400 bpm.",
		);
		expect(saveChanges).not.toHaveBeenCalled();
	});
});
