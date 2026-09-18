import { describe, expect, test } from "vite-plus/test";
import { recordingMimeType } from "./recordingMimeType";

describe("recordingMimeType", () => {
	test("Safari: AAC in MP4, saved as .m4a", () => {
		expect(recordingMimeType((t) => t === "audio/mp4")).toEqual({
			mimeType: "audio/mp4",
			ext: "m4a",
		});
	});
	test("Chrome: Opus in WebM when MP4 is not offered", () => {
		expect(recordingMimeType((t) => t.startsWith("audio/webm"))).toEqual({
			mimeType: "audio/webm;codecs=opus",
			ext: "webm",
		});
	});
	test("nothing supported", () => {
		expect(recordingMimeType(() => false)).toBeNull();
	});
});
