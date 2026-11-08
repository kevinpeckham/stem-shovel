import { describe, expect, it } from "vite-plus/test";
import { meterBeats } from "./meterBeats.js";

describe("meterBeats", () => {
	it("reads the numerator, four when there is none", () => {
		expect(meterBeats("3/4")).toBe(3);
		expect(meterBeats(" 6 / 8")).toBe(6);
		expect(meterBeats("")).toBe(4);
		expect(meterBeats("0/4")).toBe(4);
	});
});
