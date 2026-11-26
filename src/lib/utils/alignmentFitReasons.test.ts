import type { Refusal } from "@barmark/listen";
import { describe, expect, it } from "vite-plus/test";
import { alignmentFitReasons } from "./alignmentFitReasons";

/** Why an aligned chart's map was not kept, in the song check's words (@barmark/listen's refusals by name). */
const refusal = (reason: Refusal["reason"], detail?: Refusal["detail"]): Refusal => ({
	reason,
	message: `listen says ${reason}.`,
	...(detail ? { detail } : {}),
});

describe("alignmentFitReasons", () => {
	it("says Letter Lands' bar 1 and bar length as the fit always said them", () => {
		expect(
			alignmentFitReasons([
				refusal("bar-one-far", { bar1: 8.06, music: 0, declaredBar: 1.82 }),
				refusal("bar-length-off", { medianBar: 1.5, declaredBar: (60 / 132) * 4, tolerance: 0.15 }),
			]),
		).toEqual([
			"bar 1 at 0:08 where the sound starts at 0:00",
			"bars 1.5 s where the tempo says 1.82 s",
		]);
	});

	it("a weak fit, a refused re-phase and too few bars keep their sentences", () => {
		expect(
			alignmentFitReasons([refusal("weak-fit"), refusal("bars-off-middle"), refusal("no-bars")]),
		).toEqual([
			"the chart fits the recording little better than a wrong one would",
			"the chart's bars do not line up with the recording through its middle; is this the right chart?",
			"too few bars",
		]);
	});

	it("the package's new reasons are said in its own words, in the sentence's case", () => {
		expect(alignmentFitReasons([refusal("not-same-piece"), refusal("no-period")])).toEqual([
			"listen says not-same-piece",
			"listen says no-period",
		]);
	});

	it("an aligned map that does not check is not a fit reason: nothing to say", () => {
		expect(alignmentFitReasons([refusal("map-invalid")])).toEqual([]);
		expect(alignmentFitReasons([])).toEqual([]);
	});
});
