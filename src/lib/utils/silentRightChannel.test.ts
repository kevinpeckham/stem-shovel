import { describe, expect, it } from "vite-plus/test";
import { peakLevels, silentRightChannel } from "./silentRightChannel";

const report = (...peaks: string[]) =>
	peaks
		.flatMap((p, i) => [
			`[Parsed_astats_0 @ 0x7f] Channel: ${i + 1}`,
			`[Parsed_astats_0 @ 0x7f] Peak level dB: ${p}`,
		])
		.join("\n");

describe("silentRightChannel", () => {
	it("reads the channels' peaks in order, -inf as digital silence", () => {
		expect(peakLevels(report("-18.063656", "-inf"))).toEqual([-18.063656, -Infinity]);
		expect(peakLevels("")).toEqual([]);
	});
	it("is the left-only shape: two channels, the right at digital silence, the left with sound", () => {
		expect(silentRightChannel(report("-18.1", "-inf"))).toBe(true);
		expect(silentRightChannel(report("-18.1", "-95.2"))).toBe(true);
	});
	it("leaves a mono file, a real stereo file, a quiet right channel and a silent file alone", () => {
		expect(silentRightChannel(report("-18.1"))).toBe(false);
		expect(silentRightChannel(report("-18.1", "-20.4"))).toBe(false);
		expect(silentRightChannel(report("-18.1", "-78.3"))).toBe(false);
		expect(silentRightChannel(report("-inf", "-inf"))).toBe(false);
		expect(silentRightChannel(report("-inf", "-18.1"))).toBe(false);
		expect(silentRightChannel("")).toBe(false);
	});
});
