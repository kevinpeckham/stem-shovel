import { describe, expect, it } from "vite-plus/test";
import { tonicPitchClass } from "./tonicPitchClass";

describe("tonicPitchClass", () => {
	it("reads letters and accidentals, ASCII or not", () => {
		expect(tonicPitchClass("C")).toBe(0);
		expect(tonicPitchClass("F#")).toBe(6);
		expect(tonicPitchClass("B♭")).toBe(10);
		expect(tonicPitchClass("Cb")).toBe(11);
		expect(tonicPitchClass("H")).toBeNull();
		expect(tonicPitchClass("Cm")).toBeNull();
	});
});
