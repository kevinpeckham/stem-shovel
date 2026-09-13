import { describe, expect, test } from "vite-plus/test";
import { demoContentType } from "./demoContentType";
import { stemContentType } from "./stemContentType";

describe("content types by extension", () => {
	test("stems: the formats every browser decodes", () => {
		expect(stemContentType("kick.WAV")).toBe("audio/wav");
		expect(stemContentType("voice.m4a")).toBe("audio/mp4");
		expect(stemContentType("song.flac")).toBe("audio/flac");
		expect(stemContentType("memo.caf")).toBeNull();
		expect(stemContentType("noext")).toBeNull();
	});
	test("demos: the stem formats plus what phones produce", () => {
		expect(demoContentType("memo.caf")).toBe("audio/x-caf");
		expect(demoContentType("idea.opus")).toBe("audio/ogg");
		expect(demoContentType("take.aiff")).toBe("audio/aiff");
		expect(demoContentType("kick.wav")).toBe("audio/wav");
		expect(demoContentType("doc.pdf")).toBeNull();
	});
});
