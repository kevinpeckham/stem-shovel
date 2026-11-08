import { describe, expect, it } from "vite-plus/test";
import { isNetworkFetchError } from "./isNetworkFetchError";

describe("isNetworkFetchError", () => {
	it("knows each browser's message", () => {
		for (const message of [
			"Failed to fetch",
			"Load failed",
			"NetworkError when attempting to fetch resource.",
		]) {
			expect(isNetworkFetchError(new TypeError(message))).toBe(true);
		}
	});
	it("leaves other errors alone", () => {
		expect(
			isNetworkFetchError(
				new TypeError(
					"Failed to fetch dynamically imported module: https://www.stemshovel.com/_app/immutable/nodes/49.B1lqunin.js",
				),
			),
		).toBe(false);
		expect(isNetworkFetchError(new Error("Failed to fetch"))).toBe(false);
		expect(isNetworkFetchError({ message: "Failed to fetch" })).toBe(false);
		expect(isNetworkFetchError(undefined)).toBe(false);
	});
});
