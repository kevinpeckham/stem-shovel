import { describe, expect, it } from "vite-plus/test";
import type { TimingMap } from "@barmark/sync";
import { sectionBarsOnMap } from "./sectionBarsOnMap";

const MAP: TimingMap = {
	format: "barmark-timing",
	version: 1,
	chart: { bars: 3, hash: "0000000000000000" },
	bars: [
		{ bar: 1, start: 1 },
		{ bar: 2, start: 3 },
		{ bar: 3, start: 5 },
	],
	end: 7,
};

describe("sectionBarsOnMap", () => {
	it("each section at the played bar sounding at its start", () => {
		expect(
			sectionBarsOnMap(MAP, [
				{ name: "Intro", start: 1 },
				{ name: "Verse", start: 3.5 },
				{ name: "Chorus", start: 5 },
			]),
		).toEqual([
			{ name: "Intro", bar: 1 },
			{ name: "Verse", bar: 2 },
			{ name: "Chorus", bar: 3 },
		]);
	});
	it("a section before the first bar or at the end is left out", () => {
		expect(
			sectionBarsOnMap(MAP, [
				{ name: "Count-in", start: 0 },
				{ name: "Tail", start: 7 },
			]),
		).toEqual([]);
	});
});
