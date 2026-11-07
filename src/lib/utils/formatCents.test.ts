import { describe, expect, test } from "vite-plus/test";
import { formatCents } from "./formatCents";

describe("formatCents", () => {
	test("in the currency's own format", () => {
		expect(formatCents(45000, "USD")).toBe("$450.00");
		expect(formatCents(123450, "USD")).toBe("$1,234.50");
		expect(formatCents(-2000, "USD")).toBe("-$20.00");
		expect(formatCents(45050, "EUR")).toBe("€450.50");
	});
	test("a currency Intl refuses falls back to the number and the code", () => {
		expect(formatCents(45050, "not a currency")).toBe("450.50 not a currency");
		expect(formatCents(-2000, "")).toBe("-20.00 ");
	});
});
