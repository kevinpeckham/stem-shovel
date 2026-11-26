import { describe, expect, it } from "vite-plus/test";
import { chartHash, checkTimingMap, rehashTiming, type TimingMap } from "@barmark/sync";
import { timingOfText } from "./timingOfText.js";

/** The map of a copy aligned in the song's meter (chartAlignInput), carried to the saved chart. */
const saved = "| C | G | F |\n";
const copy = `time: 3/4\n${saved}`;
const map = (text: string, bars = 3): TimingMap => ({
	format: "barmark-timing",
	version: 1,
	chart: { bars, hash: chartHash(text) },
	source: "aligned",
	bars: [
		{ bar: 1, start: 0.5 },
		{ bar: 2, start: 2 },
		{ bar: 3, start: 3.5 },
	].slice(0, bars),
	end: 0.5 + 1.5 * bars,
});

describe("timingOfText", () => {
	it("the copy's map with the saved chart's hash, which checks against the saved chart", () => {
		const carried = timingOfText(map(copy), saved)!;
		expect(carried).toEqual({ ...map(copy), chart: { bars: 3, hash: chartHash(saved) } });
		expect(
			checkTimingMap(carried, { text: saved }).diagnostics.filter((d) => d.severity === "error"),
		).toEqual([]);
	});

	it("the map of the saved text itself is the map", () => {
		expect(timingOfText(map(saved), saved)).toEqual(map(saved));
	});

	it("no map when the saved chart does not play the map's bars", () => {
		expect(timingOfText(map(copy, 2), saved)).toBeNull();
	});

	it("(why not sync's rehashTiming: it refuses a copy whose bars differ in meter, which is the copy's purpose)", () => {
		const r = rehashTiming({ chart: copy, timing: map(copy) }, saved);
		expect(r).toMatchObject({ ok: false, reason: "meters-differ" });
	});
});
