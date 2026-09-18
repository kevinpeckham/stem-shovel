import {
	MAX_TAKE_SECONDS,
	SILENCE_STOP_SECONDS,
	TAKE_WARNING_SECONDS,
} from "$lib/constants/takeLimits";
import { describe, expect, test } from "vite-plus/test";
import { takeStopNotice, takeStopReason, takeWarningDue } from "./takeStopReason";

describe("takeStopReason", () => {
	test("a take under the limits with sound keeps going", () => {
		expect(takeStopReason(30, 5, true)).toBeNull();
		expect(takeStopReason(MAX_TAKE_SECONDS - 1, SILENCE_STOP_SECONDS - 1, true)).toBeNull();
	});
	test("the time limit stops the take whatever the input", () => {
		expect(takeStopReason(MAX_TAKE_SECONDS, 0, true)).toBe("limit");
		expect(takeStopReason(MAX_TAKE_SECONDS + 5, SILENCE_STOP_SECONDS + 5, false)).toBe("limit");
	});
	test("a stretch of silence stops a take: saved when it had sound, discarded when it never did", () => {
		expect(takeStopReason(200, SILENCE_STOP_SECONDS, true)).toBe("silence");
		expect(takeStopReason(SILENCE_STOP_SECONDS, SILENCE_STOP_SECONDS, false)).toBe("silent");
	});
	test("notices name the limits in minutes", () => {
		expect(takeStopNotice("limit")).toContain(`${MAX_TAKE_SECONDS / 60}-minute`);
		expect(takeStopNotice("silent")).toContain("discarded");
		expect(takeStopNotice("silence")).toContain("saved");
	});
	test("the warning is due from the warning mark", () => {
		expect(takeWarningDue(TAKE_WARNING_SECONDS - 1)).toBe(false);
		expect(takeWarningDue(TAKE_WARNING_SECONDS)).toBe(true);
	});
});
