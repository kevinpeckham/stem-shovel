import { describe, expect, it } from "vite-plus/test";
import { tidyScoreDiagnostic } from "./tidyScoreDiagnostic";

describe("tidyScoreDiagnostic", () => {
	it("drops the package's command-line hint about --part", () => {
		expect(
			tidyScoreDiagnostic(
				"no chord symbols; these parts have notes: Piano. Import one as note sets with --part",
			),
		).toBe("no chord symbols; these parts have notes: Piano.");
	});
	it("leaves any other message alone", () => {
		expect(tidyScoreDiagnostic("measures 3–4: rhythm snapped to the nearest sixteenth")).toBe(
			"measures 3–4: rhythm snapped to the nearest sixteenth",
		);
	});
});
