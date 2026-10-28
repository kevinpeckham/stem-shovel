import { describe, expect, it } from "vite-plus/test";
import { ffmpegBitrateDuration } from "./ffmpegBitrateDuration";

describe("ffmpegBitrateDuration", () => {
	it("a piped WAV's length from its size and bitrate", () => {
		const stderr = "Input #0, wav, from 'pipe:0':\n  Duration: N/A, bitrate: 3072 kb/s\n";
		// 60 s of 96 kHz 16-bit stereo: 23,040,000 bytes of samples.
		expect(ffmpegBitrateDuration(stderr, 23_040_000)).toBe(60);
	});
	it("null when ffmpeg printed a duration, no bitrate or nothing", () => {
		expect(
			ffmpegBitrateDuration("  Duration: 00:01:00.00, start: 0.000000, bitrate: N/A", 9),
		).toBeNull();
		expect(ffmpegBitrateDuration("  Duration: N/A, bitrate: N/A", 9)).toBeNull();
		expect(ffmpegBitrateDuration("", 9)).toBeNull();
	});
});
