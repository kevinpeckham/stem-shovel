import { describe, expect, test } from "vite-plus/test";
import { chartSourceText } from "./chartSourceText";

const AT = new Date(2026, 10, 10, 12).toISOString();

describe("chartSourceText", () => {
	test("the stems, with the day", () => {
		expect(chartSourceText({ kind: "stems", at: AT })).toBe(
			"Generated from the stems on Nov 10, 2026",
		);
	});
	test("a score file by name, and when it is gone", () => {
		const source = { kind: "notation" as const, id: "n1", name: "Lead sheet", at: AT };
		expect(chartSourceText(source)).toBe("From Lead sheet, read Nov 10, 2026");
		expect(chartSourceText(source, true)).toBe(
			"From Lead sheet, read Nov 10, 2026; the file is gone",
		);
		expect(chartSourceText({ kind: "file", id: "f1", at: AT })).toBe(
			"From a score, read Nov 10, 2026",
		);
	});
});
