import { expect, it } from "vite-plus/test";
import { ffmpegDuration } from "./ffmpegDuration";

it("reads hours, minutes and fractional seconds from the Duration line", () => {
	expect(
		ffmpegDuration(
			"Input #0, wav, from 'source':\n  Duration: 01:02:03.45, bitrate: 1411 kb/s\n    Stream #0:0: Audio: pcm_s16le",
		),
	).toBeCloseTo(3723.45);
	expect(ffmpegDuration("  Duration: 00:00:18.00, start: 0.000000")).toBe(18);
});

it("is null without a duration, or for N/A", () => {
	expect(ffmpegDuration("Stream #0:0: Audio: mp3")).toBeNull();
	expect(ffmpegDuration("  Duration: N/A, start: 0.000000")).toBeNull();
});
