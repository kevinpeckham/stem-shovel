import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

const download = vi.fn();
vi.mock("#lib/utils/downloadBlob.js", () => ({
	downloadBlob: (...a: unknown[]) => download(...a),
}));

const { progressionDownloads } = await import("./progressionDownloads");

describe("progressionDownloads", () => {
	beforeEach(() => download.mockReset());
	const pad = { name: "Verse idea!", midi: () => new Blob(["MThd"]), chart: () => "time: 4/4\n" };

	it("offers MIDI and a chord chart", () => {
		expect(progressionDownloads(pad).map((i) => i.label)).toEqual([
			"MIDI file",
			"Barmark chord chart",
		]);
	});

	it("names the MIDI file after the pad", () => {
		progressionDownloads(pad)[0].action();
		expect(download).toHaveBeenCalledWith(expect.any(Blob), "Verse-idea-.mid");
	});

	it("saves the chart as markdown, progression by default", async () => {
		progressionDownloads({ ...pad, name: "" })[1].action();
		const [blob, name] = download.mock.calls[0] as [Blob, string];
		expect(name).toBe("progression.chart.md");
		expect(blob.type).toBe("text/markdown;charset=utf-8");
		expect(await blob.text()).toBe("time: 4/4\n");
	});
});
