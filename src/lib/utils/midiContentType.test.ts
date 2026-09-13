import { describe, expect, test } from "vite-plus/test";
import { midiContentType } from "./midiContentType";

describe("midiContentType", () => {
	test("accepts .mid and .midi in any case", () => {
		expect(midiContentType("bass.mid")).toBe("audio/midi");
		expect(midiContentType("Keys.MIDI")).toBe("audio/midi");
	});
	test("rejects everything else", () => {
		expect(midiContentType("bass.wav")).toBeNull();
		expect(midiContentType("noext")).toBeNull();
	});
});
