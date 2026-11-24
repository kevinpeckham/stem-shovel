import { describe, expect, it } from "vite-plus/test";
import { hashBytes } from "./hashBytes";

describe("hashBytes", () => {
	it("the same bytes, the same fingerprint", () => {
		const a = new Uint8Array([1, 2, 3, 4, 5]);
		expect(hashBytes(a)).toBe(hashBytes(new Uint8Array([1, 2, 3, 4, 5])));
	});
	it("one byte different, a different fingerprint", () => {
		expect(hashBytes(new Uint8Array([1, 2, 3, 4, 5]))).not.toBe(
			hashBytes(new Uint8Array([1, 2, 3, 4, 6])),
		);
	});
	it("a different length, a different fingerprint, even with a prefix in common", () => {
		expect(hashBytes(new Uint8Array([1, 2, 3]))).not.toBe(hashBytes(new Uint8Array([1, 2, 3, 0])));
	});
	it("nothing hashes too", () => {
		expect(hashBytes(new Uint8Array(0))).toMatch(/^0-[0-9a-f]+$/);
	});
});
