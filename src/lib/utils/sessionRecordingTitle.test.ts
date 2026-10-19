import { describe, expect, test } from "vite-plus/test";
import { sessionRecordingTitle } from "./sessionRecordingTitle";

describe("sessionRecordingTitle", () => {
	test("the kind and the time Record was pressed", () => {
		const at = new Date(2026, 9, 19, 19, 42);
		expect(sessionRecordingTitle(at, "practice")).toBe("Practice 7:42 PM");
		expect(sessionRecordingTitle(new Date(2026, 9, 19, 9, 5), "show")).toBe("Show 9:05 AM");
	});
});
