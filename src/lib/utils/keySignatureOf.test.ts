import { describe, expect, it } from "vite-plus/test";
import { keySignatureOf } from "./keySignatureOf";

describe("keySignatureOf", () => {
	it("reads the major keys by their spelling", () => {
		expect(keySignatureOf("C")).toEqual({ sharps: 0, minor: false });
		expect(keySignatureOf("G major")).toEqual({ sharps: 1, minor: false });
		expect(keySignatureOf("F")).toEqual({ sharps: -1, minor: false });
		expect(keySignatureOf("F#")).toEqual({ sharps: 6, minor: false });
		expect(keySignatureOf("Gb")).toEqual({ sharps: -6, minor: false });
		expect(keySignatureOf("A♭ major")).toEqual({ sharps: -4, minor: false });
		expect(keySignatureOf("C♯ maj")).toEqual({ sharps: 7, minor: false });
		expect(keySignatureOf("Cb")).toEqual({ sharps: -7, minor: false });
	});
	it("reads the minor keys, by the relative major's signature", () => {
		expect(keySignatureOf("Am")).toEqual({ sharps: 0, minor: true });
		expect(keySignatureOf("F#m")).toEqual({ sharps: 3, minor: true });
		expect(keySignatureOf("Bb minor")).toEqual({ sharps: -5, minor: true });
		expect(keySignatureOf("A# min")).toEqual({ sharps: 7, minor: true });
		expect(keySignatureOf("E-")).toEqual({ sharps: 1, minor: true });
		expect(keySignatureOf("g#m")).toEqual({ sharps: 5, minor: true });
	});
	it("takes the enharmonic twin for a spelling with no signature", () => {
		expect(keySignatureOf("D#")).toEqual({ sharps: -3, minor: false });
		expect(keySignatureOf("Db minor")).toEqual({ sharps: 4, minor: true });
		expect(keySignatureOf("A#")).toEqual({ sharps: -2, minor: false });
	});
	it("answers null for a mode a signature cannot say, or no key at all", () => {
		expect(keySignatureOf("D dorian")).toBeNull();
		expect(keySignatureOf("")).toBeNull();
		expect(keySignatureOf("120 bpm")).toBeNull();
		expect(keySignatureOf("H")).toBeNull();
	});
});
