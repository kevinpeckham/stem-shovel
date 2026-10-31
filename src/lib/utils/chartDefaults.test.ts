import { describe, expect, it } from "vite-plus/test";
import { chartDefaults } from "./chartDefaults.js";

describe("chartDefaults", () => {
	it("reads the tempo and meter at 0:00", () => {
		expect(
			chartDefaults([
				{ kind: "tempo", start: 30, value: "90" },
				{ kind: "tempo", start: 0, value: "120" },
				{ kind: "meter", start: 0, value: "6/8" },
				{ kind: "key", start: 0, value: "D major" },
			]),
		).toEqual({ tempo: 120, meter: "6/8" });
	});
	it("gives nulls without changes at 0:00", () => {
		expect(chartDefaults([{ kind: "tempo", start: 12, value: "100" }])).toEqual({
			tempo: null,
			meter: null,
		});
	});
	it("treats a tempo that is not a positive number as none", () => {
		expect(chartDefaults([{ kind: "tempo", start: 0, value: "fast" }]).tempo).toBeNull();
		expect(chartDefaults([{ kind: "tempo", start: 0, value: "0" }]).tempo).toBeNull();
	});
});
