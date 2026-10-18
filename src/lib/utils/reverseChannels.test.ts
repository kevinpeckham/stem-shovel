import { describe, expect, it } from "vite-plus/test";
import { reverseChannels } from "./reverseChannels";

describe("reverseChannels", () => {
	it("reverses each channel into a new array", () => {
		const a = new Float32Array([1, 2, 3]);
		const [r, s] = reverseChannels([a, new Float32Array([])]);
		expect([...r!]).toEqual([3, 2, 1]);
		expect([...a]).toEqual([1, 2, 3]);
		expect(s).toHaveLength(0);
	});
});
