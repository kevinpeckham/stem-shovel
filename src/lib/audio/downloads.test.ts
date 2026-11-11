import { describe, expect, test } from "vite-plus/test";
import type { StemEngine } from "./engine.svelte.js";
import { mixQuery } from "./downloads";

const engine = (stems: { id: string; gain: number; pan?: number }[]) =>
	({ mix: () => ({ stems, master: 0.8 }) }) as unknown as StemEngine;

describe("mixQuery", () => {
	test("the original mix asks for nothing", () => {
		expect(mixQuery("original", engine([{ id: "a", gain: 1 }]))).toBe("");
	});

	test("a custom mix names the audible stems, their gains and pans, and the master", () => {
		const query = mixQuery(
			"custom",
			engine([
				{ id: "a", gain: 1 },
				{ id: "b", gain: 0.5, pan: -0.25 },
			]),
		);
		expect(new URLSearchParams(query!).get("stems")).toBe("a:1.000,b:0.500:-0.25");
		expect(new URLSearchParams(query!).get("master")).toBe("0.800");
		expect(new URLSearchParams(query!).has("arrangement")).toBe(false);
	});

	test("on an alternate arrangement the query names it, so the server mixes its stems", () => {
		const query = mixQuery("custom", engine([{ id: "a", gain: 1 }]), "arr1");
		expect(new URLSearchParams(query!).get("arrangement")).toBe("arr1");
	});

	test("null when nothing is audible", () => {
		expect(mixQuery("custom", engine([]))).toBeNull();
		expect(mixQuery("custom", null)).toBeNull();
	});
});
