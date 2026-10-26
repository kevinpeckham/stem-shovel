import { describe, expect, it } from "vite-plus/test";
import { parseEbur128Summary } from "./ebur128Summary";

/** As ffmpeg 7 prints it (static/stems/bass.wav): progress lines, then the summary. */
const stderr = `Input #0, wav, from 'static/stems/bass.wav':
  Duration: 00:00:18.00, bitrate: 1411 kb/s
[Parsed_ebur128_0 @ 0x7f23f8003100] t: 17.899969  TARGET:-23 LUFS    M: -18.1 S: -16.9     I: -16.9 LUFS       LRA:   0.2 LU  FTPK: -15.9 dBFS  TPK:  -6.0 dBFS
[Parsed_ebur128_0 @ 0x7f23f8003100] t: 17.999969  TARGET:-23 LUFS    M: -20.6 S: -16.9     I: -16.9 LUFS       LRA:   0.2 LU  FTPK: -18.3 dBFS  TPK:  -6.0 dBFS
[Parsed_ebur128_0 @ 0x7f23f8003100] Summary:

  Integrated loudness:
    I:         -16.9 LUFS
    Threshold: -26.9 LUFS

  Loudness range:
    LRA:         0.2 LU
    Threshold: -36.9 LUFS
    LRA low:   -17.0 LUFS
    LRA high:  -16.7 LUFS

  True peak:
    Peak:       -6.0 dBFS
[out#0/null @ 0xd187000] video:0KiB audio:1125KiB subtitle:0KiB other streams:0KiB global headers:0KiB muxing overhead: unknown
size=N/A time=00:00:18.00 bitrate=N/A speed= 332x    `;

describe("parseEbur128Summary", () => {
	it("reads the integrated loudness and the true peak from the summary, not the progress lines", () => {
		expect(parseEbur128Summary(stderr)).toEqual({ integrated: -16.9, truePeak: -6 });
	});
	it("takes the last summary when there are several", () => {
		const second = stderr.replace("-16.9 LUFS\n    Threshold", "-21.4 LUFS\n    Threshold");
		expect(parseEbur128Summary(`${stderr}\n${second}`)).toEqual({
			integrated: -21.4,
			truePeak: -6,
		});
	});
	it("a silent file reads -inf: null", () => {
		const silent = stderr
			.replace("I:         -16.9 LUFS", "I:         -70.0 LUFS")
			.replace("Peak:       -6.0 dBFS", "Peak:       -inf dBFS");
		expect(parseEbur128Summary(silent)).toBeNull();
	});
	it("no summary (or nothing at all): null", () => {
		expect(parseEbur128Summary("")).toBeNull();
		expect(parseEbur128Summary(stderr.slice(0, stderr.indexOf("Summary:")))).toBeNull();
	});
});
