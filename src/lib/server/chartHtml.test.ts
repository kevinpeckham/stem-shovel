import { describe, expect, it, vi } from "vite-plus/test";

vi.mock("./markdown.js", () => ({ renderMarkdown: (md: string) => `<p>${md}</p>` }));
const { renderChartHtml, renderDocHtml } = await import("./chartHtml.js");

describe("renderChartHtml", () => {
	it("draws a barmark chart as <barmark-chart> with a declarative shadow root", () => {
		const html = renderChartHtml("## Verse\n| D | A |");
		expect(html).toMatch(/^<barmark-chart theme="dark" rehearsal-letters>/); // the renderer carries its options as attributes (0.2.1)
		expect(html).toContain('<template shadowrootmode="open">');
		expect(html).toContain("Verse");
	});
	it("escapes the chart's own text", () => {
		const html = renderChartHtml(
			'## Verse "><img src=x onerror=1>\n| D |\nlyric <script>x</script>',
		);
		expect(html).not.toMatch(/<img|<script>/);
		expect(html).toContain("&lt;script&gt;");
	});
	it("draws a chart barmark reads no bars from too (the renderer draws any text)", () => {
		expect(renderChartHtml("Key: D · 145 bpm\nD5 x2・A5 x2")).toMatch(/^<barmark-chart /);
	});
	it("is empty for a blank chart", () => {
		expect(renderChartHtml("  \n")).toBe("");
	});
});

describe("renderDocHtml", () => {
	it("routes the chart to the renderer and the other documents to markdown", () => {
		expect(renderDocHtml("lyrics", "| D |")).toBe("<p>| D |</p>");
		expect(renderDocHtml("chart", "| D |")).toContain("<barmark-chart");
	});
});
