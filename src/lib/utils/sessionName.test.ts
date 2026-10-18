import { describe, expect, it } from "vite-plus/test";
import { dayText, sessionDisplayName } from "./sessionName";

describe("sessionDisplayName", () => {
	it("is the name when there is one, else the place and the day, else the kind and the day", () => {
		expect(
			sessionDisplayName({
				name: " Battle of the Bands ",
				place: "x",
				kind: "show",
				startsOn: "2026-10-18",
			}),
		).toBe("Battle of the Bands");
		expect(
			sessionDisplayName({
				name: "",
				place: "The Elbow Room",
				kind: "show",
				startsOn: "2026-10-18",
			}),
		).toBe("The Elbow Room · Oct 18, 2026");
		expect(
			sessionDisplayName({ name: "", place: " ", kind: "practice", startsOn: "2026-01-02" }),
		).toBe("Practice · Jan 2, 2026");
	});
	it("dayText reads a day as local, not UTC", () => {
		expect(dayText("2026-10-18")).toBe("Oct 18, 2026");
		expect(dayText("nonsense")).toBe("nonsense");
	});
});
