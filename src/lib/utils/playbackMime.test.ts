import { describe, expect, test } from "vite-plus/test";
import { playbackMime } from "./playbackMime";

describe("playbackMime", () => {
	test("names the codec so ALAC and AAC are told apart", () => {
		expect(playbackMime("alac")).toBe('audio/mp4; codecs="alac"');
		expect(playbackMime("aac")).toBe('audio/mp4; codecs="mp4a.40.2"');
		expect(playbackMime("flac")).toBe("audio/flac");
	});
	test("unknown or missing codecs mean the rendition", () => {
		expect(playbackMime(null)).toBeNull();
		expect(playbackMime("wma")).toBeNull();
	});
});
