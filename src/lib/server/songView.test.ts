import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import { data, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

vi.mock("#lib/server/chartHtml.js", () => ({
	renderScoreChartHtml: (md: string) => `score:${md}`,
	renderChartHtml: (md: string) => `grid:${md}`,
}));
const { songView } = await import("./songView");

const row = (extra: Record<string, unknown> = {}) =>
	({
		id: "s1",
		stems: [],
		files: [],
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

	describe("the chart's score", () => {
		const at = "2026-11-10T12:00:00.000Z";
		const pdf = {
			id: "f1",
			kind: "pdf",
			url: "https://blob/f1.pdf",
			title: "",
			filename: "Lead sheet.pdf",
			status: "ready",
		};
		it("a chart read from a PDF still attached: the plain grid, the file as its score, no note", async () => {
			const view = await songView(
				row({ chartSource: { kind: "file", id: "f1", at }, files: [pdf], chartMarkdown: "| Hb |" }),
			);
			expect(view.docs.chart).toBe("grid:| Hb |");
			expect(view.song.chartScoreFile).toEqual({
				id: "f1",
				kind: "pdf",
				url: "https://blob/f1.pdf",
				name: "Lead sheet.pdf",
			});
			expect(view.song.chartScoreNote).toBeNull();
		});
		it("an image counts; its title names it", async () => {
			const image = { ...pdf, kind: "image", title: "Page 1" };
			const view = await songView(
				row({ chartSource: { kind: "file", id: "f1", at }, files: [image] }),
			);
			expect(view.song.chartScoreFile).toMatchObject({ kind: "image", name: "Page 1" });
		});
		it("the file gone, not ready, or another kind of source: the package's score switch", async () => {
			for (const extra of [
				{ chartSource: { kind: "file", id: "f1", at }, files: [] },
				{ chartSource: { kind: "file", id: "f1", at }, files: [{ ...pdf, status: "uploading" }] },
				{ chartSource: { kind: "notation", id: "f1", at }, files: [pdf] },
				{ chartSource: { kind: "stems", at }, files: [pdf] },
				{},
			]) {
				const view = await songView(row(extra));
				expect(view.docs.chart).toBe("score:| C |");
				expect(view.song.chartScoreFile).toBeNull();
			}
		});
		it("an engraved chart that cannot be drawn says why", async () => {
			expect((await songView(row({ chartMarkdown: "| C | Qz7 |" }))).song.chartScoreNote).toBe(
				"Line 1: Qz7: a chord starts with a root A–G",
			);
			expect((await songView(row())).song.chartScoreNote).toBeNull();
		});
	});
});
