import { render } from "@testing-library/svelte";
import { describe, expect, test } from "vite-plus/test";
import ChartReadout from "./ChartReadout.svelte";

const CHART = "## Verse\n| C | ? | G | C |\n| / | / |";
const defaults = { tempo: 120, meter: "4/4" };

describe("ChartReadout", () => {
	test("the bars, sections and length at the song's tempo, with the parser's warnings", () => {
		const { container } = render(ChartReadout, { markdown: CHART, defaults });
		expect(container).toHaveTextContent("6 bars · 1 section · 0:12");
		expect(container.querySelectorAll(".text-amber-300").length).toBeGreaterThan(0);
	});
	test("warnings off keeps the summary alone, as the read editor lists them itself", () => {
		const { container } = render(ChartReadout, { markdown: CHART, defaults, warnings: false });
		expect(container).toHaveTextContent("6 bars · 1 section · 0:12");
		expect(container.querySelectorAll(".text-amber-300").length).toBe(0);
	});
	test("a chart that reads no bars gets the example and the guide's link in the open, with the parser's errors", () => {
		const { container } = render(ChartReadout, { markdown: "Verse: D A Bm G", defaults });
		expect(container).toHaveTextContent("No bars read");
		expect(container.querySelector("pre")?.textContent).toBe("## Verse\n| D | A | Bm | G |");
		expect(container.querySelector('a[href="/docs/writing-a-chord-chart"]')).not.toBeNull();
		const broken = render(ChartReadout, { markdown: "| D | | G |", defaults }).container;
		expect(broken.querySelector(".text-amber-300")?.textContent).toMatch(/^Line 1: /);
		expect(broken.querySelector("pre")).not.toBeNull();
	});
	test("a chart that reads keeps the example behind the tip", () => {
		const { container } = render(ChartReadout, { markdown: CHART, defaults });
		expect(container.querySelector("pre")).toBeNull();
	});
	test("nothing without the song's defaults or for a blank chart", () => {
		expect(render(ChartReadout, { markdown: CHART }).container.textContent?.trim()).toBe("");
		expect(render(ChartReadout, { markdown: "  ", defaults }).container.textContent?.trim()).toBe(
			"",
		);
	});
});
