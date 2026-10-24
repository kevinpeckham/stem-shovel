import { describe, expect, it } from "vite-plus/test";
import { decodePcmFile, encodePcmFile } from "./pcmFile";

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
