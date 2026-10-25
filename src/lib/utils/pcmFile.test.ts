import { describe, expect, it } from "vite-plus/test";
import {
	decodePcmFile,
	encodePcmFile,
	pcmFileBytes,
	pcmPlaneRange,
	readPcmHeader,
} from "./pcmFile";

describe("pcmFile", () => {
	it("round-trips the channels and the rate, every float exact", () => {
		const left = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 0.987654321);
		const right = Float32Array.from({ length: 1000 }, (_, i) => -i / 1000);
		const bytes = encodePcmFile([left, right], 44100);
		expect(bytes.byteLength).toBe(20 + 2 * 1000 * 4);
		const back = decodePcmFile(bytes.buffer as ArrayBuffer);
		expect(back?.sampleRate).toBe(44100);
		expect(back?.channels).toHaveLength(2);
		expect(Array.from(back!.channels[0]!)).toEqual(Array.from(left));
		expect(Array.from(back!.channels[1]!)).toEqual(Array.from(right));
	});
	it("keeps an empty source", () => {
		const back = decodePcmFile(encodePcmFile([new Float32Array(0)], 48000).buffer as ArrayBuffer);
		expect(back?.channels[0]).toHaveLength(0);
	});
	it("answers null for another file, a short one or a bad header", () => {
		const good = encodePcmFile([new Float32Array(10)], 48000);
		expect(decodePcmFile(new ArrayBuffer(4))).toBeNull();
		const wrongMagic = good.slice();
		wrongMagic[0] = 0x52; // "R", as a RIFF file starts
		expect(decodePcmFile(wrongMagic.buffer)).toBeNull();
		expect(decodePcmFile(good.slice(0, good.byteLength - 4).buffer)).toBeNull();
		const noRate = good.slice();
		new DataView(noRate.buffer).setUint32(8, 0, true);
		expect(decodePcmFile(noRate.buffer)).toBeNull();
	});
});

describe("readPcmHeader", () => {
	it("reads the rate, channels and frames from the first 20 bytes alone", () => {
		const file = encodePcmFile([new Float32Array(300), new Float32Array(300)], 44100);
		expect(readPcmHeader(file.slice(0, 20).buffer)).toEqual({
			sampleRate: 44100,
			channels: 2,
			frames: 300,
		});
		expect(pcmFileBytes(readPcmHeader(file.buffer as ArrayBuffer)!)).toBe(file.byteLength);
	});
	it("answers null for too few bytes, another magic, no rate or no channels", () => {
		const good = encodePcmFile([new Float32Array(4)], 48000);
		expect(readPcmHeader(good.slice(0, 19).buffer)).toBeNull();
		const riff = good.slice();
		riff[0] = 0x52;
		expect(readPcmHeader(riff.buffer)).toBeNull();
		const noRate = good.slice();
		new DataView(noRate.buffer).setUint32(8, 0, true);
		expect(readPcmHeader(noRate.buffer)).toBeNull();
		const noChannels = good.slice();
		new DataView(noChannels.buffer).setUint32(12, 0, true);
		expect(readPcmHeader(noChannels.buffer)).toBeNull();
	});
});

describe("pcmPlaneRange", () => {
	const header = { sampleRate: 48000, channels: 2, frames: 1000 };
	it("places channel 0's window after the header", () => {
		expect(pcmPlaneRange(header, 0, 100, 50)).toEqual({ at: 20 + 100 * 4, bytes: 200 });
	});
	it("places a later channel after the earlier planes whole", () => {
		expect(pcmPlaneRange(header, 1, 0, 10)).toEqual({ at: 20 + 1000 * 4, bytes: 40 });
		expect(pcmPlaneRange(header, 1, 990, 10)).toEqual({ at: 20 + 1990 * 4, bytes: 40 });
	});
	it("clips a window that runs past the end, and one that starts there is empty", () => {
		expect(pcmPlaneRange(header, 1, 900, 500)).toEqual({ at: 20 + 1900 * 4, bytes: 400 });
		expect(pcmPlaneRange(header, 0, 1000, 10).bytes).toBe(0);
		expect(pcmPlaneRange(header, 0, 5000, 10).bytes).toBe(0);
		expect(pcmPlaneRange(header, 0, -10, 20)).toEqual({ at: 20, bytes: 80 });
	});
	it("a channel the file lacks is empty", () => {
		expect(pcmPlaneRange(header, 2, 0, 10).bytes).toBe(0);
	});
	it("the planes read back the samples the file holds", () => {
		const left = Float32Array.from({ length: 64 }, (_, i) => i);
		const right = Float32Array.from({ length: 64 }, (_, i) => -i);
		const file = encodePcmFile([left, right], 48000);
		const h = readPcmHeader(file.buffer as ArrayBuffer)!;
		const { at, bytes } = pcmPlaneRange(h, 1, 60, 10);
		expect(Array.from(new Float32Array(file.buffer, at, bytes / 4))).toEqual([-60, -61, -62, -63]);
	});
});
