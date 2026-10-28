import { describe, expect, it } from "vite-plus/test";
import { eventPlace } from "./eventPlace";

describe("eventPlace", () => {
	it("the venue first, then the practice location, then the legacy text", () => {
		expect(
			eventPlace({ place: { name: "The Echo" }, location: { name: "Garage" }, venue: "Old" }),
		).toBe("The Echo");
		expect(eventPlace({ place: null, location: { name: "Garage" }, venue: "Old" })).toBe("Garage");
		expect(eventPlace({ place: null, location: null, venue: " Old Hall " })).toBe("Old Hall");
	});
	it("empty when nothing says where", () => {
		expect(eventPlace({ venue: "" })).toBe("");
	});
});
