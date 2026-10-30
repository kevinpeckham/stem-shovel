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
			{ time: "00:00:00.00", shown: "00:00:00.00", seconds: 0, kind: "tempo", value: "120" },
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
});
