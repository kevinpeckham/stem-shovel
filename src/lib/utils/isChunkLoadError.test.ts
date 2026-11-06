import { describe, expect, it } from "vite-plus/test";
import { isChunkLoadError } from "./isChunkLoadError";

describe("isChunkLoadError", () => {
	it("knows each browser's message", () => {
		for (const message of [
			"Failed to fetch dynamically imported module: https://www.stemshovel.com/_app/immutable/nodes/59.D2zoqTsl.js",
			"error loading dynamically imported module: https://www.stemshovel.com/_app/immutable/nodes/59.D2zoqTsl.js",
			"Importing a module script failed.",
		]) {
			expect(isChunkLoadError(new TypeError(message))).toBe(true);
		}
	});
	it("leaves other errors alone", () => {
		expect(isChunkLoadError(new TypeError("Failed to fetch"))).toBe(false);
		expect(isChunkLoadError({ message: "Importing a module script failed." })).toBe(false);
		expect(isChunkLoadError(undefined)).toBe(false);
	});
});
