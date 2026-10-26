import { describe, expect, test } from "vite-plus/test";
import { recordingDownloadName } from "./recordingDownloadName";

describe("recordingDownloadName", () => {
	test("slugifies the title and takes the extension given or the file's own", () => {
		expect(recordingDownloadName("Battle of the Bands: set 2!", "REC001.WAV", "mp3")).toBe(
			"battle-of-the-bands-set-2.mp3",
		);
		expect(recordingDownloadName("Battle of the Bands: set 2!", "REC001.WAV")).toBe(
			"battle-of-the-bands-set-2.wav",
		);
	});
	test("falls back to the filename's stem, then to 'recording'", () => {
		expect(recordingDownloadName("", "Voice Memo 12.m4a")).toBe("voice-memo-12.m4a");
		expect(recordingDownloadName("", "Voice Memo 12.m4a", "mp3")).toBe("voice-memo-12.mp3");
		expect(recordingDownloadName("!!!", "???", "mp3")).toBe("recording.mp3");
		expect(recordingDownloadName("Take", "take")).toBe("take");
	});
	test("the input source follows the title, so one performance's devices stay apart", () => {
		expect(recordingDownloadName("Set 2", "a.wav", "mp3", "Room Mic")).toBe("set-2-room-mic.mp3");
		expect(recordingDownloadName("Set 2", "a.wav", undefined, "Kevin's phone")).toBe(
			"set-2-kevin-s-phone.wav",
		);
		expect(recordingDownloadName("Set 2", "a.wav", "mp3", "  ")).toBe("set-2.mp3");
	});
	test("the input device's label stands in when there is no input name", () => {
		expect(recordingDownloadName("Set 2", "a.wav", "mp3", "", "Phone")).toBe("set-2-phone.mp3");
		expect(recordingDownloadName("Set 2", "a.wav", "mp3", "Room Mic", "Soundboard")).toBe(
			"set-2-room-mic.mp3",
		);
		expect(recordingDownloadName("Set 2", "a.wav", "mp3", "", "")).toBe("set-2.mp3");
	});
});
