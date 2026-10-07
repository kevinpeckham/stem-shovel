import { describe, expect, it } from "vite-plus/test";
import { BitReader } from "./bitReader";

describe("BitReader", () => {
	it("reads from the top of each byte down", () => {
		const r = new BitReader(Uint8Array.from([0b10110010, 0b01000000]));
		expect(r.read(1)).toBe(1);
		expect(r.read(3)).toBe(0b011);
		expect(r.read(6)).toBe(0b001001);
	});
	it("reads a zero-bit field as 0 without moving", () => {
		const r = new BitReader(Uint8Array.from([0xff]));
		expect(r.read(0)).toBe(0);
		expect(r.read(8)).toBe(255);
	});
	it("throws a RangeError past the end, even one bit over", () => {
		const r = new BitReader(Uint8Array.from([0xab]));
		expect(r.read(8)).toBe(0xab);
		expect(() => r.read(1)).toThrow(RangeError);
		expect(() => new BitReader(new Uint8Array()).read(1)).toThrow("Read past the end");
	});
});
