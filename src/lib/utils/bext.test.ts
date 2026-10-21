import { describe, expect, it } from "vite-plus/test";
import { bextChunk, readBext } from "./bext";
import { encodeWav24 } from "./encodeWav24";

describe("bext", () => {
	const info = {
		description: "Guitar – Verse take",
		originator: "Stem Shovel Dawn 0.141.0",
		originatorReference: "clip-abc",
		date: new Date(2026, 9, 21, 14, 5, 9),
		timeReference: 12.5 * 48000,
		loudness: { integrated: -18.26, truePeak: -3.1 },
		codingHistory: "A=PCM,F=48000,W=24,M=stereo,T=Stem Shovel Dawn",
	};
	it("writes a version 2 chunk of an even length that reads back", () => {
		const chunk = bextChunk(info);
		expect(String.fromCharCode(...chunk.subarray(0, 4))).toBe("bext");
		expect(chunk.length % 2).toBe(0);
		const wav = encodeWav24([new Float32Array(10), new Float32Array(10)], 48000, [chunk]);
		const back = readBext(wav)!;
		expect(back.version).toBe(2);
		// The en dash is outside Latin-1 and becomes "?"; the rest is as written.
		expect(back.description).toBe("Guitar ? Verse take");
		expect(back.originator).toBe("Stem Shovel Dawn 0.141.0");
		expect(back.originatorReference).toBe("clip-abc");
		expect(back.originationDate).toBe("2026-10-21");
		expect(back.originationTime).toBe("14:05:09");
		expect(back.timeReference).toBe(600000);
		expect(back.loudnessValue).toBe(-18.26);
		expect(back.maxTruePeakLevel).toBe(-3.1);
		expect(back.codingHistory).toBe("A=PCM,F=48000,W=24,M=stereo,T=Stem Shovel Dawn");
	});
	it("marks a missing loudness as not set, and carries a position past 32 bits", () => {
		const chunk = bextChunk({ timeReference: 2 ** 33 + 7 });
		const back = readBext(encodeWav24([new Float32Array(4)], 44100, [chunk]))!;
		expect(back.loudnessValue).toBeNull();
		expect(back.maxTruePeakLevel).toBeNull();
		expect(back.timeReference).toBe(2 ** 33 + 7);
		expect(back.codingHistory).toBe("");
	});
	it("answers null for a WAV without the chunk, or for bytes that are no WAV", () => {
		expect(readBext(encodeWav24([new Float32Array(4)], 44100))).toBeNull();
		expect(readBext(new Uint8Array([1, 2, 3]))).toBeNull();
	});
	it("keeps the file playable: the data chunk follows the extra chunk and the RIFF size counts it", () => {
		const chunk = bextChunk({ timeReference: 0 });
		const wav = encodeWav24([new Float32Array([0.5, -0.5])], 8000, [chunk]);
		const v = new DataView(wav);
		expect(v.getUint32(4, true)).toBe(wav.byteLength - 8);
		const dataAt = 12 + 24 + chunk.length;
		expect(String.fromCharCode(...new Uint8Array(wav, dataAt, 4))).toBe("data");
		expect(v.getUint32(dataAt + 4, true)).toBe(6);
	});
});
