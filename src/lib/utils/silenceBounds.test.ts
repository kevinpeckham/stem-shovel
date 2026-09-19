import { describe, expect, test } from "vite-plus/test";
import { silenceBounds } from "./silenceBounds";

const line = (s: string) => `[silencedetect @ 0x1] ${s}\n`;
const progress = (t: string) => `size=N/A time=${t} bitrate=N/A speed= 500x\n`;

describe("silenceBounds", () => {
	test("silence at both ends is cut, leaving a little room", () => {
		const log =
			line("silence_start: 0") +
			line("silence_end: 2 | silence_duration: 2") +
			line("silence_start: 9") +
			progress("00:00:12.00");
		expect(silenceBounds(log)).toEqual({ start: 1.7, end: 9.5, duration: 12 });
	});
	test("a trailing silence that closes at the very end counts as trailing", () => {
		const log =
			line("silence_start: 8.5") +
			line("silence_end: 12 | silence_duration: 3.5") +
			progress("00:00:12.00");
		expect(silenceBounds(log)).toEqual({ start: 0, end: 9, duration: 12 });
	});
	test("silence in the middle is not touched", () => {
		const log =
			line("silence_start: 4") +
			line("silence_end: 6 | silence_duration: 2") +
			progress("00:00:12.00");
		expect(silenceBounds(log)).toBeNull();
	});
	test("nothing to cut, a silent file, or an unreadable log leaves the take alone", () => {
		expect(silenceBounds(progress("00:00:05.00"))).toBeNull();
		expect(silenceBounds(line("silence_start: 0") + progress("00:00:05.00"))).toBeNull();
		expect(silenceBounds("")).toBeNull();
	});
	test("the room never runs past the file", () => {
		const log = line("silence_start: 11.8") + progress("00:00:12.00");
		expect(silenceBounds(log)).toBeNull(); // 12.3 clamps to 12: nothing worth cutting
		const short =
			line("silence_start: 0") +
			line("silence_end: 0.2 | silence_duration: 0.2") +
			progress("00:01:00.00");
		expect(silenceBounds(short)).toBeNull(); // 0.2 - 0.3 pad = 0: no cut
	});
});
