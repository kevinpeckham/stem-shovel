import { describe, expect, test } from "vite-plus/test";
import { venueDetailsOf } from "./venueDetailsOf.js";

const venue = {
	name: "The Echo",
	address: " 1822 W Sunset Blvd ",
	city: "Los Angeles",
	mapUrl: "",
	websiteUrl: " https://theecho.com ",
	contact: " Sam ",
	notes: " Load in the back \n",
};

describe("venueDetailsOf", () => {
	test("the chosen venue's details, trimmed", () => {
		expect(venueDetailsOf(venue, "v1", {})).toEqual({
			place: "1822 W Sunset Blvd, Los Angeles",
			directions:
				"https://www.google.com/maps/search/?api=1&query=" +
				encodeURIComponent("The Echo, 1822 W Sunset Blvd, Los Angeles"),
			website: "https://theecho.com",
			contact: "Sam",
			notes: "Load in the back",
		});
	});

	test("the venue's own map link wins", () => {
		expect(
			venueDetailsOf({ ...venue, mapUrl: "https://maps.example/x" }, "v1", {})?.directions,
		).toBe("https://maps.example/x");
	});

	test("a picked venue whose row is missing shows nothing, even with old free text", () => {
		expect(venueDetailsOf(null, "v2", { venue: "Old place", venueNotes: "x" })).toBeNull();
	});

	test("no venue: the free text from before venues", () => {
		expect(
			venueDetailsOf(null, "", {
				venue: "Old place",
				address: "",
				city: "Austin",
				mapUrl: null,
				venueNotes: " side door ",
			}),
		).toEqual({
			place: "Old place, Austin",
			directions:
				"https://www.google.com/maps/search/?api=1&query=" +
				encodeURIComponent("Old place, Austin"),
			website: "",
			contact: "",
			notes: "side door",
		});
	});

	test("no venue and only notes", () => {
		expect(venueDetailsOf(null, "", { venueNotes: "bring cables" })).toMatchObject({
			place: "",
			directions: "",
			notes: "bring cables",
		});
	});

	test("no venue and no free text: null", () => {
		expect(venueDetailsOf(null, "", {})).toBeNull();
		expect(venueDetailsOf(null, "", { venue: " ", venueNotes: " " })).toBeNull();
	});
});
