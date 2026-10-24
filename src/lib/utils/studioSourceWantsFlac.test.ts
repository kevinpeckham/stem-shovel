import { describe, expect, it } from "vite-plus/test";
import { studioSourceWantsFlac } from "./studioSourceWantsFlac";

/** Which Studio sources are still WAV and so get a FLAC rendition. */
describe("studioSourceWantsFlac", () => {
	it("a Studio take (codec pcm) and a WAV import by type or extension want it", () => {
		expect(studioSourceWantsFlac({ codec: "pcm", name: "a/s1.wav" })).toBe(true);
		expect(studioSourceWantsFlac({ codec: null, contentType: "audio/x-wav", name: "a/s1" })).toBe(
			true,
		);
		expect(studioSourceWantsFlac({ codec: null, contentType: "AUDIO/WAV", name: "a/s1" })).toBe(
			true,
		);
		expect(studioSourceWantsFlac({ codec: null, name: "Guitar.WAV" })).toBe(true);
	});
	it("a FLAC, an MP3 or a source already converted does not", () => {
		expect(studioSourceWantsFlac({ codec: "flac", name: "a/s1.flac" })).toBe(false);
		expect(studioSourceWantsFlac({ codec: "pcm", name: "a/s1.flac" })).toBe(false);
		expect(
			studioSourceWantsFlac({ codec: null, contentType: "audio/mpeg", name: "a/s1.mp3" }),
		).toBe(false);
		expect(
			studioSourceWantsFlac({ codec: null, contentType: "audio/flac", name: "a/s1.flac" }),
		).toBe(false);
	});
});
