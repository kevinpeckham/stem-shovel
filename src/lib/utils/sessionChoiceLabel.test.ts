import { describe, expect, test } from "vite-plus/test";
import { sessionChoiceLabel } from "./sessionChoiceLabel";

const base = { name: "", place: "The Echo", kind: "show" as const, startsOn: "2026-10-18" };

describe("sessionChoiceLabel", () => {
	test("a session without a name reads as its place and day, once", () => {
		expect(sessionChoiceLabel({ ...base, eventId: null }, "ev1")).toBe("The Echo · Oct 18, 2026");
	});
	test("a named session gets the day after its name", () => {
		expect(sessionChoiceLabel({ ...base, name: "Release show", eventId: null }, "ev1")).toBe(
			"Release show · Oct 18, 2026",
		);
	});
	test("one tied to another event says so; one tied to this event does not", () => {
		expect(sessionChoiceLabel({ ...base, eventId: "ev2" }, "ev1")).toBe(
			"The Echo · Oct 18, 2026 (linked elsewhere)",
		);
		expect(sessionChoiceLabel({ ...base, eventId: "ev1" }, "ev1")).toBe("The Echo · Oct 18, 2026");
	});
});
