import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import type { SectionsAnswer } from "#lib/server/aiDetect.js";
import type { AlignedChart } from "#lib/utils/placedSections.js";
import type { SongChange } from "#lib/val/SongChangeSchema.js";
import type { SongSection } from "#lib/val/SongSectionSchema.js";

/** The settings' Sections tab: the remote calls are stand-ins, notifications are recorded. */
const saveSections = vi.hoisted(() =>
	vi.fn<(args: { id: string; sections: SongSection[] }) => Promise<void>>(async () => {}),
);
const detectSections = vi.hoisted(() =>
	vi.fn<(args: { id: string }) => Promise<SectionsAnswer>>(async () => ({
		sections: [],
		notes: "",
	})),
);
vi.mock("#lib/remote/songs.remote.js", () => ({ saveSections, detectSections }));
const notify = vi.hoisted(() => vi.fn());
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify }));

const { SongChanges } = await import("./songChanges.svelte");
const { SongSections } = await import("./songSections.svelte");

function make(sections: SongSection[], { hasScore = false } = {}) {
	const song = { id: "song1", sections, changes: [] as SongChange[] };
	const onsaved = vi.fn(async () => {});
	const alignChart = vi.fn(async (): Promise<AlignedChart> => ({ reason: "none" }));
	const changes = new SongChanges({
		song: () => song,
		posCtx: () => ({ fps: 25, grid: null }),
		onsaved: async () => {},
	});
	const ss = new SongSections({
		song: () => song,
		grid: () => null,
		hasScore: () => hasScore,
		changes,
		alignChart,
		onsaved,
	});
	return { ss, song, onsaved, alignChart };
}

beforeEach(() => {
	saveSections.mockClear();
	detectSections.mockClear();
	notify.mockClear();
	vi.unstubAllGlobals();
});

describe("SongSections", () => {
	test("reset fills the rows from the song; Add row numbers the next; Remove drops one", () => {
		const { ss } = make([{ index: "I", name: "Intro", start: 0 }]);
		ss.reset();
		expect(ss.rows).toEqual([
			{ index: "I", name: "Intro", time: "00:00:00.00", shown: "00:00:00.00", seconds: 0 },
		]);
		ss.add();
		expect(ss.rows[1]).toEqual({
			index: "II",
			name: "",
			time: "00:00:00.00",
			shown: "",
			seconds: null,
		});
		ss.remove(0);
		expect(ss.rows.map((r) => r.index)).toEqual(["II"]);
	});

	test("save names a row that is not a position and saves nothing", async () => {
		const { ss } = make([]);
		ss.rows = [{ index: "I", name: "Intro", time: "soon", shown: "", seconds: null }];
		await ss.save();
		expect(ss.error).toBe(
			'"soon" is not a position (time 1:23.4, timecode 01:23:15.72, or bars 12|3).',
		);
		expect(saveSections).not.toHaveBeenCalled();
	});

	test("save keeps an untouched row's exact seconds, refreshes and says so", async () => {
		const { ss, onsaved } = make([{ index: "I", name: "Intro", start: 1.234 }]);
		ss.reset();
		ss.rows.push({ index: "II", name: "Verse", time: "0:10.0", shown: "", seconds: null });
		await ss.save();
		expect(saveSections).toHaveBeenCalledWith({
			id: "song1",
			sections: [
				{ index: "I", name: "Intro", start: 1.234 },
				{ index: "II", name: "Verse", start: 10 },
			],
		});
		expect(onsaved).toHaveBeenCalled();
		expect(notify).toHaveBeenCalledWith("Sections saved");
		expect(ss.saving).toBe(false);
	});

	test("Detect on a song without sections saves the answer at once, numbered", async () => {
		detectSections.mockResolvedValueOnce({
			sections: [
				{ at: 0, name: "Intro" },
				{ at: 12.34, name: "Verse" },
			],
			notes: "",
		});
		const { ss } = make([]);
		await ss.detect();
		expect(saveSections).toHaveBeenCalledWith({
			id: "song1",
			sections: [
				{ index: "I", name: "Intro", start: 0 },
				{ index: "II", name: "Verse", start: 12.3 },
			],
		});
		expect(notify).toHaveBeenCalledWith("2 sections set from the AI", { timeout: 8000 });
		expect(ss.answer).toBeNull();
		expect(ss.busy).toBe(false);
	});

	test("Detect on a song with sections offers the answer; Use these asks first", async () => {
		detectSections.mockResolvedValueOnce({ sections: [{ at: 5, name: "Chorus" }], notes: "" });
		const { ss } = make([{ index: "I", name: "Intro", start: 0 }], { hasScore: true });
		await ss.detect();
		expect(ss.answer?.sections).toEqual([{ at: 5, name: "Chorus" }]);
		expect(saveSections).not.toHaveBeenCalled();
		const confirm = vi.fn(() => false);
		vi.stubGlobal("confirm", confirm);
		await ss.useAnswer();
		expect(confirm).toHaveBeenCalledWith("Replace the song's sections with the detected ones?");
		expect(saveSections).not.toHaveBeenCalled();
		expect(ss.words).toEqual({ from: "the AI and the chart", ones: "detected" });
	});

	test("Detect while the mix renders says so; an empty answer is a notice", async () => {
		detectSections.mockRejectedValueOnce(Object.assign(new Error("busy"), { status: 409 }));
		const { ss } = make([]);
		await ss.detect();
		expect(ss.error).toBe("The mix is still rendering; try again in a moment");
		await ss.detect();
		expect(ss.error).toBeNull();
		expect(notify).toHaveBeenCalledWith("The AI could not tell the sections apart", {
			kind: "info",
		});
	});

	test("Place from chart says why when the chart cannot be aligned", async () => {
		const { ss, alignChart } = make([], { hasScore: true });
		await ss.placeFromChart();
		expect(alignChart).toHaveBeenCalled();
		expect(ss.source).toBe("chart");
		expect(ss.words).toEqual({ from: "the chart", ones: "placed" });
		expect(notify).toHaveBeenCalledWith("Write the song's chart or attach its score first.", {
			kind: "info",
		});
		expect(saveSections).not.toHaveBeenCalled();
		expect(ss.busy).toBe(false);
	});
});
