import { describe, expect, test } from "vite-plus/test";
import { artistLine } from "./artistLine";

describe("artistLine", () => {
	test("one, two and more names", () => {
		expect(artistLine([])).toBe("");
		expect(artistLine(["MMKK"])).toBe("MMKK");
		expect(artistLine(["MMKK", "Mahony"])).toBe("MMKK & Mahony");
		expect(artistLine(["A", "B", "C"])).toBe("A, B & C");
	});
	test("blank names are dropped", () => {
		expect(artistLine([" ", "A", ""])).toBe("A");
	});
});
