import { describe, expect, test } from "vite-plus/test";
import { pendingText } from "./pendingText";

describe("pendingText", () => {
	test("state then the thing", () => {
		expect(pendingText({ kind: "demo", state: "rendering", label: "Rough" })).toBe(
			"Rendering the demo Rough",
		);
		expect(pendingText({ kind: "stem", state: "uploading", label: "Bass" })).toBe(
			"Upload not finished: the stem Bass",
		);
		expect(pendingText({ kind: "mix", state: "failed", label: "v2" })).toBe(
			"Playback failed for the mix v2",
		);
	});
	test("the song-level jobs have no label", () => {
		expect(pendingText({ kind: "song-mix", state: "rendering", label: "" })).toBe(
			"Rendering the stem mix",
		);
		expect(pendingText({ kind: "notes", state: "rendering", label: "" })).toBe(
			"Rendering the notes transcription",
		);
		expect(pendingText({ kind: "notation", state: "rendering", label: "Lead sheet" })).toBe(
			"Rendering the notation PDF Lead sheet",
		);
	});
});
