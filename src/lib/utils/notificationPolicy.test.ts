import { describe, expect, test } from "vite-plus/test";
import { DEFAULT_PREFS, digestDue, emailDelivery, KIND_PRIORITY } from "./notificationPolicy";

describe("emailDelivery", () => {
	test("high priority and accepted invitations always email at once", () => {
		for (const k of ["storage-limit", "seats-full", "invitation-accepted"] as const) {
			expect(emailDelivery(k, DEFAULT_PREFS)).toBe("now");
			expect(emailDelivery(k, { ...DEFAULT_PREFS, digest: "weekly" })).toBe("now");
		}
		expect(KIND_PRIORITY["storage-limit"]).toBe("high");
	});
	test("the opt-in kinds stay in the inbox until switched on", () => {
		expect(emailDelivery("comment", DEFAULT_PREFS)).toBe("never");
		expect(emailDelivery("stems", DEFAULT_PREFS)).toBe("never");
		expect(emailDelivery("song", DEFAULT_PREFS)).toBe("never");
		expect(emailDelivery("demo", DEFAULT_PREFS)).toBe("never");
	});
	test("switched on, they email at once or wait for the digest", () => {
		expect(emailDelivery("comment", { ...DEFAULT_PREFS, emailComments: true })).toBe("now");
		expect(
			emailDelivery("comment", { ...DEFAULT_PREFS, emailComments: true, digest: "daily" }),
		).toBe("digest");
		expect(emailDelivery("stems", { ...DEFAULT_PREFS, emailComments: true, digest: "daily" })).toBe(
			"never",
		);
	});
});

describe("digestDue", () => {
	const now = new Date("2026-09-26T13:00:00Z");
	test("none is never due; a first digest is due at once", () => {
		expect(digestDue("none", null, now)).toBe(false);
		expect(digestDue("daily", null, now)).toBe(true);
		expect(digestDue("weekly", null, now)).toBe(true);
	});
	test("daily after about a day, weekly after about a week", () => {
		expect(digestDue("daily", new Date("2026-09-25T15:00:00Z"), now)).toBe(false);
		expect(digestDue("daily", new Date("2026-09-25T13:30:00Z"), now)).toBe(true);
		expect(digestDue("weekly", new Date("2026-09-21T13:00:00Z"), now)).toBe(false);
		expect(digestDue("weekly", new Date("2026-09-19T13:00:00Z"), now)).toBe(true);
	});
});
