import { describe, expect, test } from "vite-plus/test";
import { directionsUrl } from "./directionsUrl";

describe("directionsUrl", () => {
	test("the map link wins", () => {
		expect(directionsUrl({ mapUrl: " https://maps.app.goo.gl/x ", name: "The Echo" })).toBe(
			"https://maps.app.goo.gl/x",
		);
	});
	test("else a map search of the parts that are set", () => {
		expect(directionsUrl({ mapUrl: "", name: "The Echo", address: " ", city: "Los Angeles" })).toBe(
			"https://www.google.com/maps/search/?api=1&query=The%20Echo%2C%20Los%20Angeles",
		);
	});
	test("nothing set is no link", () => {
		expect(directionsUrl({ name: null, address: "", city: undefined })).toBe("");
	});
});
