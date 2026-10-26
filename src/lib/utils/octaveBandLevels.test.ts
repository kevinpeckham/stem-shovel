import { describe, expect, it } from "vite-plus/test";
import { parseOctaveBandLevels } from "./octaveBandLevels";

/** ffmpeg's stderr for one band's volumedetect (its index `n` in the graph). */
const block = (n: number, mean: string) =>
	[
		`[Parsed_volumedetect_${n} @ 0x7f3cdc0106c0] n_samples: 576000`,
		`[Parsed_volumedetect_${n} @ 0x7f3cdc0106c0] mean_volume: ${mean} dB`,
		`[Parsed_volumedetect_${n} @ 0x7f3cdc0106c0] max_volume: -6.9 dB`,
		`[Parsed_volumedetect_${n} @ 0x7f3cdc0106c0] histogram_6db: 208`,
	].join("\n");
const LEVELS = [
	"-24.3",
	"-16.0",
	"-18.2",
	"-26.1",
	"-32.8",
	"-39.0",
	"-44.9",
	"-50.6",
	"-55.0",
	"-91.0",
];
/** As ffmpeg prints it: the first configuration's empty instances, then the bands last to first (indices 3, 6 … 30). */
const realistic = (levels = LEVELS) =>
	[
		"Input #0, mp3, from 'rendition.mp3':",
		...levels.map((_, i) => `[Parsed_volumedetect_${3 + 3 * i} @ 0x390d] n_samples: 0`),
		...levels.map((v, i) => block(3 + 3 * i, v)).reverse(),
		"[out#0/null @ 0x55] video:0KiB audio:253125KiB",
	].join("\n");

describe("parseOctaveBandLevels", () => {
	it("reads the ten bands in the graph's order, not the print order", () => {
		expect(parseOctaveBandLevels(realistic())).toEqual(LEVELS.map(Number));
	});
	it("orders by the filter index numerically (9 before 12)", () => {
		const levels = parseOctaveBandLevels(realistic());
		expect(levels?.[2]).toBe(-18.2);
		expect(levels?.[3]).toBe(-26.1);
	});
	it("stores a silent band as -100", () => {
		const levels = ["-20.0", ...LEVELS.slice(1, 9), "-inf"];
		expect(parseOctaveBandLevels(realistic(levels))?.at(-1)).toBe(-100);
	});
	it("is null with fewer bands than asked for", () => {
		expect(parseOctaveBandLevels(realistic(LEVELS.slice(0, 9)))).toBeNull();
		expect(parseOctaveBandLevels("")).toBeNull();
	});
	it("is null when a value is not a number", () => {
		expect(parseOctaveBandLevels(realistic([...LEVELS.slice(0, 9), "nan"]))).toBeNull();
	});
	it("takes the band count it is given", () => {
		expect(parseOctaveBandLevels(realistic(LEVELS.slice(0, 3)), 3)).toEqual([-24.3, -16, -18.2]);
	});
});
