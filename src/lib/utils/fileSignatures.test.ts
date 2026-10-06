import { describe, expect, it } from "vite-plus/test";
import { imageTypeOfBytes, isPdfBytes, startsLikeMusicXml, startsLikeZip } from "./fileSignatures";

const ascii = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

describe("fileSignatures", () => {
	it("knows a PDF by its header and nothing else", () => {
		expect(isPdfBytes(ascii("%PDF-1.7 ..."))).toBe(true);
		expect(isPdfBytes(ascii("  %PDF-1.4"))).toBe(false);
		expect(isPdfBytes(ascii("<html>"))).toBe(false);
		expect(isPdfBytes(ascii("%PD"))).toBe(false);
	});
	it("tells WebP and PNG apart from the rest", () => {
		const webp = Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")]);
		expect(imageTypeOfBytes(webp)).toBe("image/webp");
		const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]);
		expect(imageTypeOfBytes(png)).toBe("image/png");
		expect(imageTypeOfBytes(ascii("GIF89a"))).toBeNull();
		const wav = Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")]);
		expect(imageTypeOfBytes(wav)).toBeNull();
	});
	it("knows a zip (a compressed MusicXML file) by its local file header", () => {
		expect(startsLikeZip(Uint8Array.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0]))).toBe(true);
		expect(startsLikeZip(ascii("PK"))).toBe(false);
		expect(startsLikeZip(ascii('<?xml version="1.0"?>'))).toBe(false);
		expect(startsLikeZip(new Uint8Array(0))).toBe(false);
	});
	it("sniffs an uncompressed MusicXML document without parsing it", () => {
		const partwise =
			'<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 4.0 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">\n<score-partwise version="4.0">';
		expect(startsLikeMusicXml(new TextEncoder().encode(partwise))).toBe(true);
		// A BOM and leading whitespace are fine; so is a document that opens with the score element.
		expect(
			startsLikeMusicXml(
				Uint8Array.from([0xef, 0xbb, 0xbf, ...ascii('  \n<score-timewise version="3.1">')]),
			),
		).toBe(true);
		expect(startsLikeMusicXml(ascii("<!DOCTYPE score-timewise>\n<score-timewise>"))).toBe(true);
		// XML that is not a score, HTML, a PDF and a zip are not.
		expect(
			startsLikeMusicXml(ascii('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>')),
		).toBe(false);
		expect(startsLikeMusicXml(ascii("<html><body>score-partwise</body></html>"))).toBe(false);
		expect(startsLikeMusicXml(ascii("%PDF-1.7 score-partwise"))).toBe(false);
		expect(startsLikeMusicXml(Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))).toBe(false);
		// Only the first 4 KB count: a score element buried past that is not seen.
		const padded = `<?xml version="1.0"?><!-- ${"x".repeat(5000)} --><score-partwise/>`;
		expect(startsLikeMusicXml(ascii(padded))).toBe(false);
		expect(startsLikeMusicXml(new Uint8Array(0))).toBe(false);
	});
});

import { looksLikeText, startsLikeAudio, startsLikeImage, startsLikeMidi } from "./fileSignatures";

describe("fileSignatures by attachment kind", () => {
	it("knows PNG, JPEG, WebP and GIF as images", () => {
		expect(startsLikeImage(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
			true,
		);
		expect(startsLikeImage(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0]))).toBe(true);
		expect(
			startsLikeImage(Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBPVP8 ")])),
		).toBe(true);
		expect(startsLikeImage(ascii("GIF89a"))).toBe(true);
		expect(startsLikeImage(ascii("%PDF-1.4"))).toBe(false);
		expect(startsLikeImage(Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")]))).toBe(
			false,
		);
	});
	it("knows the audio containers by their headers", () => {
		expect(startsLikeAudio(ascii("ID3\x04"))).toBe(true);
		expect(startsLikeAudio(Uint8Array.from([0xff, 0xfb, 0x90, 0x00]))).toBe(true);
		expect(startsLikeAudio(Uint8Array.from([0xff, 0xf1, 0x50, 0x80]))).toBe(true);
		expect(startsLikeAudio(Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")]))).toBe(
			true,
		);
		expect(startsLikeAudio(Uint8Array.from([0, 0, 0, 0x20, ...ascii("ftypM4A ")]))).toBe(true);
		expect(startsLikeAudio(ascii("OggS"))).toBe(true);
		expect(startsLikeAudio(ascii("fLaC"))).toBe(true);
		expect(startsLikeAudio(Uint8Array.from([...ascii("FORM"), 0, 0, 0, 0, ...ascii("AIFF")]))).toBe(
			true,
		);
		expect(startsLikeAudio(Uint8Array.from([...ascii("FORM"), 0, 0, 0, 0, ...ascii("AIFC")]))).toBe(
			true,
		);
		expect(startsLikeAudio(Uint8Array.from([...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")]))).toBe(
			false,
		);
		expect(startsLikeAudio(ascii("MThd"))).toBe(false);
		expect(startsLikeAudio(Uint8Array.from([0xff]))).toBe(false);
	});
	it("knows a MIDI file by its header chunk", () => {
		expect(startsLikeMidi(ascii("MThd\x00\x00\x00\x06"))).toBe(true);
		expect(startsLikeMidi(ascii("MTrk"))).toBe(false);
	});
	it("calls valid UTF-8 without a NUL byte text", () => {
		expect(looksLikeText(new TextEncoder().encode("# Notes\nchorus at 1:20 — été"))).toBe(true);
		expect(looksLikeText(Uint8Array.from([0xef, 0xbb, 0xbf, ...ascii("bom")]))).toBe(true);
		expect(looksLikeText(ascii("a\x00b"))).toBe(false);
		expect(looksLikeText(Uint8Array.from([0xc3, 0x28]))).toBe(false);
		expect(looksLikeText(new Uint8Array(0))).toBe(false);
		// A multi-byte character cut at the 4 KB edge is not a fault of the text.
		const long = new TextEncoder().encode("x".repeat(4095) + "é");
		expect(looksLikeText(long)).toBe(true);
	});
});
