import { describe, expect, test } from "vite-plus/test";
import { chartSectionName } from "./chartSectionName.js";

describe("chartSectionName", () => {
	test("section words, numbered or not, keep the chart's spelling", () => {
		expect(chartSectionName("Chorus")).toBe("Chorus");
		expect(chartSectionName("Verse 2")).toBe("Verse 2");
		expect(chartSectionName("Pre-chorus")).toBe("Pre-chorus");
		expect(chartSectionName("pre chorus")).toBe("pre chorus");
		expect(chartSectionName("Outro:")).toBe("Outro");
		expect(chartSectionName("[Bridge]")).toBe("Bridge");
		expect(chartSectionName("Coda")).toBe("Coda");
	});

	test("other words are not sections", () => {
		expect(chartSectionName("rit.")).toBeNull();
		expect(chartSectionName("To Coda")).toBeNull();
		expect(chartSectionName("Fine")).toBeNull();
		expect(chartSectionName("Chorus of angels sang")).toBeNull();
	});
});
