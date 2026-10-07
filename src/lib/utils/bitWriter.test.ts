import { describe, expect, it } from "vite-plus/test";
import { BitReader } from "./bitReader";
import { BitWriter } from "./bitWriter";

describe("BitWriter", () => {
	it("packs most significant bit first and pads the last byte with zeros", () => {
		const w = new BitWriter();
		w.write(0b101, 3);
		w.write(0b11, 2);
		// 10111 then three zero bits
		expect(Array.from(w.bytes())).toEqual([0b10111000]);
	});
	it("fills a byte exactly and starts the next on the following bit", () => {
		const w = new BitWriter();
		w.write(0b111, 3);
		w.write(0b11111, 5);
		w.write(1, 1);
		expect(Array.from(w.bytes())).toEqual([0xff, 0x80]);
	});
	it("writes nothing for zero bits and keeps only the low bits of a wide value", () => {
		const w = new BitWriter();
		w.write(99, 0);
		expect(w.bytes().length).toBe(0);
		w.write(0b1101, 2); // only 01 survives
		expect(Array.from(w.bytes())).toEqual([0b01000000]);
	});
	it("round-trips mixed widths across byte boundaries", () => {
		const fields: [number, number][] = [
			[9, 8],
			[200, 8],
			[127, 7],
			[1, 1],
			[5, 3],
			[65535, 16],
			[0, 4],
			[3, 2],
		];
		const w = new BitWriter();
		for (const [value, bits] of fields) w.write(value, bits);
		expect(w.bytes().length).toBe(Math.ceil(49 / 8));
		const r = new BitReader(w.bytes());
		expect(fields.map(([, bits]) => r.read(bits))).toEqual(fields.map(([value]) => value));
	});
});
