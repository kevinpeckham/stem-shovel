import { describe, expect, test } from "vite-plus/test";
import { encodeWav } from "./encodeWav";

describe("encodeWav", () => {
	test("writes a well-formed 16-bit stereo WAV", async () => {
		const left = new Float32Array([0, 0.5, -0.5, 1, -1]);
		const right = new Float32Array([0, -0.5, 0.5, -1, 1]);
		const blob = encodeWav([left, right], 48000);
		expect(blob.type).toBe("audio/wav");
		const view = new DataView(await blob.arrayBuffer());
		const tag = (o: number) => String.fromCharCode(...new Uint8Array(view.buffer, o, 4));
		expect(tag(0)).toBe("RIFF");
		expect(tag(8)).toBe("WAVE");
		expect(view.getUint16(20, true)).toBe(1); // PCM
		expect(view.getUint16(22, true)).toBe(2);
		expect(view.getUint32(24, true)).toBe(48000);
		expect(view.getUint32(40, true)).toBe(5 * 2 * 2);
		expect(view.getInt16(44, true)).toBe(0);
		expect(view.getInt16(46, true)).toBe(0);
		// Interleaved frames: L R L R … from byte 44.
		expect(view.getInt16(48, true)).toBe(Math.round(0.5 * 0x7fff));
		expect(view.getInt16(50, true)).toBe(-0.5 * 0x8000);
		expect(view.getInt16(56, true)).toBe(0x7fff);
		expect(view.getInt16(58, true)).toBe(-0x8000);
		expect(view.getInt16(60, true)).toBe(-0x8000);
		expect(view.getInt16(62, true)).toBe(0x7fff);
	});
	test("an empty take is a header alone", async () => {
		const blob = encodeWav([new Float32Array(0)], 44100);
		expect(blob.size).toBe(44);
	});
});
