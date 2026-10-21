import { describe, expect, test } from "vite-plus/test";
import { audioSampleRate } from "./audioSampleRate";

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const u32le = (n: number) => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];
const u32be = (n: number) => [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255];
const u16be = (n: number) => [(n >> 8) & 255, n & 255];
const bytes = (...parts: number[][]) => Uint8Array.from(parts.flat());

describe("audioSampleRate", () => {
	test("WAV: the fmt chunk, after a chunk before it", () => {
		const list = [...ascii("LIST"), ...u32le(3), 1, 2, 3, 0];
		const fmt = [
			...ascii("fmt "),
			...u32le(16),
			1,
			0,
			2,
			0,
			...u32le(44_100),
			...u32le(0),
			4,
			0,
			16,
			0,
		];
		const wav = bytes(ascii("RIFF"), u32le(100), ascii("WAVE"), list, fmt, ascii("data"), u32le(0));
		expect(audioSampleRate(wav)).toBe(44_100);
		expect(audioSampleRate(bytes(ascii("RF64"), u32le(100), ascii("WAVE"), fmt))).toBe(44_100);
	});
	test("AIFF: the COMM chunk's 80-bit rate", () => {
		// 48000 = 0xBB80 × 2^0: exponent 16383 + 15, mantissa 0xBB800000_00000000.
		const comm = [
			...ascii("COMM"),
			...u32be(18),
			...u16be(2),
			...u32be(0),
			...u16be(24),
			...u16be(16_398),
			...u32be(0xbb80_0000),
			...u32be(0),
		];
		expect(audioSampleRate(bytes(ascii("FORM"), u32be(50), ascii("AIFF"), comm))).toBe(48_000);
		const comm441 = [
			...ascii("COMM"),
			...u32be(18),
			...u16be(2),
			...u32be(0),
			...u16be(16),
			...u16be(16_398),
			...u32be(0xac44_0000),
			...u32be(0),
		];
		expect(audioSampleRate(bytes(ascii("FORM"), u32be(50), ascii("AIFC"), comm441))).toBe(44_100);
	});
	test("FLAC: STREAMINFO's twenty bits", () => {
		const info = Array.from({ length: 34 }, () => 0);
		// 96000 = 0x17700 → bytes 10..12: 0x17, 0x70, 0x0_ (the high nibble of the third).
		info[10] = 0x17;
		info[11] = 0x70;
		info[12] = 0x00;
		expect(audioSampleRate(bytes(ascii("fLaC"), [0x80, 0, 0, 34], info))).toBe(96_000);
	});
	test("MP3: the first frame after an ID3v2 tag; MPEG-2 halves the rate", () => {
		const id3 = [...ascii("ID3"), 4, 0, 0, 0, 0, 0, 5, 1, 2, 3, 4, 5];
		// MPEG-1 layer III, 44.1 kHz: FF FB 90 00.
		expect(audioSampleRate(bytes(id3, [0xff, 0xfb, 0x90, 0]))).toBe(44_100);
		// MPEG-2 layer III, 24 kHz (index 1 → 48000 / 2): FF F3 94 00.
		expect(audioSampleRate(bytes([0xff, 0xf3, 0x94, 0]))).toBe(24_000);
	});
	test("MP4: the mp4a sample entry's rate", () => {
		const entry = [
			...ascii("mp4a"),
			...Array.from({ length: 24 }, () => 0),
			...u16be(48_000),
			0,
			0,
		];
		expect(
			audioSampleRate(
				bytes(
					[0, 0, 0, 24],
					ascii("ftyp"),
					ascii("M4A "),
					Array.from({ length: 40 }, () => 0),
					entry,
				),
			),
		).toBe(48_000);
	});
	test("Ogg: Vorbis says its rate, Opus is 48 kHz", () => {
		const page = (packet: number[]) =>
			bytes([...ascii("OggS"), ...Array.from({ length: 22 }, () => 0), 1, packet.length], packet);
		expect(
			audioSampleRate(page([1, ...ascii("vorbis"), 0, 0, 0, 0, 1, ...u32le(44_100), 0, 0, 0, 0])),
		).toBe(44_100);
		expect(audioSampleRate(page([...ascii("OpusHead"), 1, 2, 0, 0, ...u32le(44_100)]))).toBe(
			48_000,
		);
	});
	test("anything else, or a rate outside what audio uses, is null", () => {
		expect(
			audioSampleRate(
				bytes(
					ascii("PK\u0003\u0004"),
					Array.from({ length: 20 }, () => 0),
				),
			),
		).toBeNull();
		expect(audioSampleRate(new Uint8Array(0))).toBeNull();
		const fmt = [...ascii("fmt "), ...u32le(16), 1, 0, 2, 0, ...u32le(7), ...u32le(0), 4, 0, 16, 0];
		expect(audioSampleRate(bytes(ascii("RIFF"), u32le(100), ascii("WAVE"), fmt))).toBeNull();
	});
});
