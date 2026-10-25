import { describe, expect, it } from "vite-plus/test";
import { stripLeadingHeading } from "./stripLeadingHeading";

describe("stripLeadingHeading", () => {
	it("drops an opening h1 and the blank lines after it", () => {
		expect(stripLeadingHeading("# Getting started\n\nStem Shovel is a place.\n")).toBe(
			"Stem Shovel is a place.\n",
		);
	});
	it("leaves a lesser heading, prose and a later h1 alone", () => {
		expect(stripLeadingHeading("## Who sees it\n\ntext")).toBe("## Who sees it\n\ntext");
		expect(stripLeadingHeading("text\n\n# Later")).toBe("text\n\n# Later");
		expect(stripLeadingHeading("#hashtag not a heading")).toBe("#hashtag not a heading");
	});
});
