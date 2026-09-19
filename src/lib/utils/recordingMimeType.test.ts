import { describe, expect, test } from "vite-plus/test";
import { recordingMimeType } from "./recordingMimeType";

const safari18 = (t: string) => t === "audio/mp4" || t === "audio/mp4; codecs=alac";
const oldSafari = (t: string) => t === "audio/mp4";
const chrome135 = (t: string) => t.startsWith("audio/webm");
const firefox = (t: string) => t === "audio/webm;codecs=opus" || t === "audio/ogg;codecs=opus";

describe("recordingMimeType", () => {
	test("Safari 18.4+: ALAC in MP4, lossless", () => {
		expect(recordingMimeType(safari18)).toMatchObject({
			ext: "m4a",
			codec: "ALAC",
			lossless: true,
		});
	});
	test("older Safari: AAC in MP4", () => {
		expect(recordingMimeType(oldSafari)).toMatchObject({
			ext: "m4a",
			codec: "AAC",
			lossless: false,
		});
	});
	test("Chrome 135+: raw PCM in WebM, lossless; Opus when compressed is asked for", () => {
		expect(recordingMimeType(chrome135)).toMatchObject({
			mimeType: "audio/webm;codecs=pcm",
			codec: "PCM",
		});
		expect(recordingMimeType(chrome135, "compressed")).toMatchObject({
			codec: "Opus",
			ext: "webm",
		});
	});
	test("Firefox: Opus, whatever quality is asked for", () => {
		expect(recordingMimeType(firefox)).toMatchObject({ codec: "Opus", lossless: false });
	});
	test("nothing supported", () => {
		expect(recordingMimeType(() => false)).toBeNull();
	});
});
