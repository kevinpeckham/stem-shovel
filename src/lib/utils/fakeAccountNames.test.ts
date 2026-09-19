import { describe, expect, test } from "vite-plus/test";
import { fakeAccountNames } from "./fakeAccountNames";

describe("fakeAccountNames", () => {
	test("gives distinct two-word names that never equal the real one", () => {
		let i = 0;
		const seq = [0.1, 0.2, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 0.95];
		const names = fakeAccountNames(4, "Hollow Mountain", () => seq[i++ % seq.length]);
		expect(names).toHaveLength(4);
		expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(4);
		expect(names.every((n) => n.split(" ").length === 2)).toBe(true);
		expect(names).not.toContain("Hollow Mountain");
	});
});
