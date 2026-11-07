import { describe, expect, it } from "vite-plus/test";
import { scorePartsOf } from "./scorePartsOf";
import { tidyScoreDiagnostic } from "./tidyScoreDiagnostic";

const RAW =
	"no chord symbols; these parts have notes: Piano, Bass. Import one as note sets with --part";

describe("scorePartsOf", () => {
	it("the parts the no-chord-symbols error names, raw or tidied", () => {
		expect(scorePartsOf([{ message: RAW }])).toEqual(["Piano", "Bass"]);
		expect(scorePartsOf([{ message: tidyScoreDiagnostic(RAW) }])).toEqual(["Piano", "Bass"]);
	});

	it("past the clause about text that looks like chord symbols", () => {
		const message =
			"no chord symbols; text that looks like chord symbols in measures 1–4 (the program exported them as text); these parts have notes: Voice, Piano. Import one as note sets with --part";
		expect(scorePartsOf([{ message: tidyScoreDiagnostic(message) }])).toEqual(["Voice", "Piano"]);
	});

	it("none for an unrelated message or none at all", () => {
		expect(scorePartsOf([{ message: "nothing to import: no chord symbols and no notes" }])).toEqual(
			[],
		);
		expect(scorePartsOf([{ message: "A rhythm snapped in measure 2." }])).toEqual([]);
		expect(scorePartsOf([])).toEqual([]);
	});
});
