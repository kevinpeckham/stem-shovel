import { describe, expect, test } from "vite-plus/test";
import { centsText } from "./centsText";
import { parseMoney } from "./parseMoney";

describe("centsText", () => {
	test("the form's text for a stored amount", () => {
		expect(centsText(null)).toBe("");
		expect(centsText(45050)).toBe("450.50");
		expect(centsText(45000)).toBe("450");
		expect(centsText(-2000)).toBe("-20");
		expect(centsText(7)).toBe("0.07");
		expect(centsText(-2050)).toBe("-20.50");
		expect(centsText(0)).toBe("0");
	});
	test("parseMoney reads it back", () => {
		for (const cents of [0, 7, 45050, 45000, -2000, -2050, 123456789])
			expect(parseMoney(centsText(cents))).toBe(cents);
	});
});
