import { describe, expect, test } from "vite-plus/test";
import { DraftStoppedError, draftStopNotice } from "./draftStopped.js";

describe("draftStopped", () => {
	test("the notice names the stop in plain words and says what the card shows instead", () => {
		expect(draftStopNotice("content-filter")).toMatch(/safety filter stopped the draft/);
		expect(draftStopNotice("length")).toMatch(/ran out of room/);
		expect(draftStopNotice("other")).toMatch(/finish reason: other/);
		expect(draftStopNotice("content-filter")).toMatch(
			/built from the detected chords; Generate chart again/,
		);
	});

	test("the error carries the reason and the notice", () => {
		const e = new DraftStoppedError("content-filter");
		expect(e).toBeInstanceOf(Error);
		expect(e.reason).toBe("content-filter");
		expect(e.message).toBe(draftStopNotice("content-filter"));
	});
});
