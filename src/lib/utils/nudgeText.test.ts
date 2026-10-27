import { describe, expect, test } from "vite-plus/test";
import { nudgeText } from "./nudgeText";

describe("nudgeText", () => {
	test("one line per kind", () => {
		expect(nudgeText({ kind: "stale", at: new Date(2026, 8, 29) })).toBe(
			"Not changed since Sep 29, 2026",
		);
		expect(nudgeText({ kind: "chart-no-recording", at: new Date() })).toBe(
			"A chart but no recording yet",
		);
		expect(nudgeText({ kind: "idea-no-take", at: new Date() })).toBe("No take yet");
	});
});
