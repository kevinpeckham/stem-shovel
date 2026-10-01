import { describe, expect, it } from "vite-plus/test";
import { stableStringify } from "./stableStringify";

describe("stableStringify", () => {
	it("serialises the same values the same whatever the key order", () => {
		expect(stableStringify({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: null } })).toBe(
			stableStringify({ a: { c: null, d: [1, { y: 2, z: 1 }] }, b: 1 }),
		);
	});
	it("keeps arrays in order and tells values apart", () => {
		expect(stableStringify([2, 1])).toBe("[2,1]");
		expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }));
		expect(stableStringify(null)).toBe("null");
	});
});
