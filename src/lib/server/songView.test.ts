import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import { data, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

vi.mock("#lib/server/chartHtml.js", () => ({ renderScoreChartHtml: (md: string) => md }));
const { songView } = await import("./songView");

const row = (extra: Record<string, unknown> = {}) =>
	({
		id: "s1",
		stems: [],
		demos: [],
		mixes: [],
		chartMarkdown: "| C |",
		lyricsMarkdown: "",
		notesMarkdown: "",
		...extra,
	}) as unknown as Parameters<typeof songView>[0];

beforeEach(() => {
	resetRemoteMocks();
	data.presentSongFiles.mockImplementation(async (s: unknown) => s);
	for (const fn of ["listComments", "listMixComments", "listDemoComments"])
		data[fn].mockResolvedValue([]);
	data.manifestFor.mockResolvedValue({});
	for (const fn of [
		"stemsWantingPlayback",
		"stemsWantingMetadata",
		"demosWantingPlayback",
		"demosWantingPeaks",
		"mixesWantingPlayback",
	])
		data[fn].mockReturnValue([]);
});

describe("songView", () => {
	it("carries the chart's source, null when the chart is the band's own", async () => {
		const source = { kind: "stems", at: "2026-11-10T12:00:00.000Z" };
		expect((await songView(row({ chartSource: source }))).song.chartSource).toEqual(source);
		expect((await songView(row())).song.chartSource).toBeNull();
	});
});
