import { describe, expect, it } from "vite-plus/test";
import { looksLikeNetwork, withRetries } from "./withRetries";

describe("withRetries", () => {
	it("runs again after a network-looking failure and gives up after the delays", async () => {
		let calls = 0;
		const result = await withRetries(async () => {
			calls++;
			if (calls < 3) throw new TypeError("Failed to fetch");
			return "ok";
		}, [0, 0]);
		expect(result).toBe("ok");
		expect(calls).toBe(3);
		calls = 0;
		await expect(
			withRetries(async () => {
				calls++;
				throw new TypeError("Failed to fetch");
			}, [0]),
		).rejects.toThrow("Failed to fetch");
		expect(calls).toBe(2);
	});
	it("throws an answer straight away", async () => {
		let calls = 0;
		await expect(
			withRetries(async () => {
				calls++;
				throw new Error("Not a supported format");
			}, [0, 0]),
		).rejects.toThrow("Not a supported format");
		expect(calls).toBe(1);
	});
	it("knows the network's wording", () => {
		expect(looksLikeNetwork(new TypeError("Failed to fetch"))).toBe(true);
		expect(looksLikeNetwork(new Error("Vercel Blob: network error"))).toBe(true);
		expect(looksLikeNetwork(new Error("A song holds 256 stems at most"))).toBe(false);
	});
});
