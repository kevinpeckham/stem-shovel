import { describe, expect, it } from "vite-plus/test";
import { decodedStemBytes } from "./decodedStemBytes";
import { stemMemoryBudget } from "./stemMemoryBudget";

describe("decodedStemBytes", () => {
	it("reckons seconds × channels × 32 kHz × 4 bytes, and nothing for unknowns", () => {
		expect(decodedStemBytes([{ durationSeconds: 240, channels: 2 }])).toBe(240 * 2 * 32000 * 4);
		expect(
			decodedStemBytes([
				{ durationSeconds: 10, channels: 1 },
				{ durationSeconds: null, channels: 2 },
			]),
		).toBe(10 * 32000 * 4);
		expect(decodedStemBytes([])).toBe(0);
	});
});

describe("stemMemoryBudget", () => {
	it("is a quarter of the device's memory when known, else a gigabyte", () => {
		expect(stemMemoryBudget(8)).toBe(2 * 1024 ** 3);
		expect(stemMemoryBudget(4)).toBe(1024 ** 3);
		expect(stemMemoryBudget(undefined)).toBe(1024 ** 3);
		expect(stemMemoryBudget(0)).toBe(1024 ** 3);
	});
});
