import { describe, expect, it } from "vite-plus/test";
import { intervalSemitones } from "./intervalSemitones";

describe("intervalSemitones", () => {
	it("counts each degree above the root, then its alteration", () => {
		expect(intervalSemitones({ degree: 1, alter: 0 })).toBe(0);
		expect(intervalSemitones({ degree: 3, alter: -1 })).toBe(3);
		expect(intervalSemitones({ degree: 5, alter: 1 })).toBe(8);
		expect(intervalSemitones({ degree: 7, alter: -2 })).toBe(9);
		expect(intervalSemitones({ degree: 8, alter: 0 })).toBe(12);
		expect(intervalSemitones({ degree: 9, alter: -1 })).toBe(13);
		expect(intervalSemitones({ degree: 11, alter: 1 })).toBe(18);
		expect(intervalSemitones({ degree: 13, alter: 0 })).toBe(21);
	});
});
