import { describe, expect, it } from "vite-plus/test";
import { encodeWav24 } from "./encodeWav24";

describe("encodeWav24", () => {
	it("writes a 24-bit stereo header and interleaved samples", () => {
		const left = new Float32Array([0, 0.5, -0.5, 1]);
		const right = new Float32Array([0, -0.5, 0.5, -1]);
		const out = encodeWav24([left, right], 48000);
		const v = new DataView(out);
		const tag = (at: number) => String.fromCharCode(...new Uint8Array(out, at, 4));
		expect(tag(0)).toBe("RIFF");
		expect(tag(8)).toBe("WAVE");
		expect(v.getUint16(22, true)).toBe(2);
		expect(v.getUint32(24, true)).toBe(48000);
		expect(v.getUint16(34, true)).toBe(24);
		expect(v.getUint32(40, true)).toBe(4 * 2 * 3);
		expect(out.byteLength).toBe(44 + 24);
		// Frame 1: left 0.5 → round(0.5 × 8388607) = 4194304 (0x400000); right −0.5 → −4194303 (two's complement 0xC00001).
		const frame1 = 44 + 6;
		expect([v.getUint8(frame1), v.getUint8(frame1 + 1), v.getUint8(frame1 + 2)]).toEqual([
			0, 0, 0x40,
		]);
		expect([v.getUint8(frame1 + 3), v.getUint8(frame1 + 4), v.getUint8(frame1 + 5)]).toEqual([
			1, 0, 0xc0,
		]);
		// Full scale clips to the 24-bit maximum.
		const frame3 = 44 + 18;
		expect([v.getUint8(frame3), v.getUint8(frame3 + 1), v.getUint8(frame3 + 2)]).toEqual([
			0xff, 0xff, 0x7f,
		]);
	});
});
