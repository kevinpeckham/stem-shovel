import { describe, expect, test } from "vite-plus/test";
import {
	BarOneError,
	chordDraftErrorMessage,
	ChordsError,
	DraftError,
	GridError,
	ModelNotReady,
	PlacementError,
	SaveError,
} from "./chordDraftErrors";

describe("chordDraftErrors", () => {
	test.each([
		[GridError, "GridError", "Generating the chart failed"],
		[ChordsError, "ChordsError", "Chord detection failed"],
		[PlacementError, "PlacementError", "Placing the bars failed"],
		[BarOneError, "BarOneError", "Setting the start of bar 1 failed"],
		[DraftError, "DraftError", "The draft failed"],
		[SaveError, "SaveError", "Saving the chart failed"],
	])("%o carries its tag, its step and the message", (Class, tag, step) => {
		const e = new Class({ cause: new Error("gateway down") });
		expect(e._tag).toBe(tag);
		expect(e.step).toBe(step);
		expect(e.cause).toEqual(new Error("gateway down"));
		expect(e.message).toBe(`${step}: gateway down`);
		expect(chordDraftErrorMessage(e)).toBe(`${step}: gateway down`);
	});

	test("a step's cause reads like any caught value: a string, a remote function's HttpError", () => {
		expect(
			chordDraftErrorMessage(new GridError({ cause: "Set a tempo and a time signature first" })),
		).toBe("Generating the chart failed: Set a tempo and a time signature first");
		expect(
			chordDraftErrorMessage(new SaveError({ cause: { status: 500, body: { message: "No" } } })),
		).toBe("Saving the chart failed: No");
	});

	test("anything else is its own message, without a step", () => {
		expect(chordDraftErrorMessage(new Error("plain"))).toBe("plain");
		expect(chordDraftErrorMessage(null)).toBe("Something went wrong");
		const notReady = new ModelNotReady({ inFlight: true, claimWindowPassed: false });
		expect(notReady._tag).toBe("ModelNotReady");
		expect(notReady).toMatchObject({ inFlight: true, claimWindowPassed: false });
		expect(chordDraftErrorMessage(notReady)).toBe("Something went wrong");
	});
});
