import { describe, expect, test } from "vite-plus/test";
import { tempoUnitLabels } from "./tempoUnitLabels.js";

describe("tempoUnitLabels", () => {
	test("eighths and dotted quarters over 8, sixteenths and dotted eighths over 16", () => {
		expect(tempoUnitLabels("6/8")).toEqual({ bottom: "eighth notes", dotted: "dotted quarters" });
		expect(tempoUnitLabels(" 12/8 ")).toEqual({
			bottom: "eighth notes",
			dotted: "dotted quarters",
		});
		expect(tempoUnitLabels("6/16")).toEqual({
			bottom: "sixteenth notes",
			dotted: "dotted eighths",
		});
	});

	test("null for a meter that is not compound", () => {
		for (const m of ["4/4", "3/8", "7/8", "6/4", "", null, undefined]) {
			expect(tempoUnitLabels(m)).toBeNull();
		}
	});
});
