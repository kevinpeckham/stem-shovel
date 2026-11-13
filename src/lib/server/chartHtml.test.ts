import { describe, expect, it, vi } from "vite-plus/test";
import { ENGRAVER_CDN_INTEGRITY, ENGRAVER_WASM_INTEGRITY } from "@barmark/score";

vi.mock("./markdown.js", () => ({ renderMarkdown: (md: string) => `<p>${md}</p>` }));
const { ENGRAVER_URL, renderChartHtml, renderDocHtml, renderScoreChartHtml } =
	await import("./chartHtml.js");

describe("renderChartHtml", () => {
	it("draws a barmark chart as <barmark-chart> with a declarative shadow root", () => {
		const html = renderChartHtml("## Verse\n| D | A |");
		expect(html).toMatch(/^<barmark-chart theme="light" rehearsal-letters>/); // the renderer carries its options as attributes (0.2.1)
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
		expect(renderDocHtml("chart", "| D |")).toMatch(/^<barmark-score /);
	});
	it("draws the song's chart as <barmark-score>: the grid and the Grid / Score switch in a declarative shadow root", () => {
		const html = renderDocHtml("chart", "## Verse\n| D | A |");
		expect(html).toMatch(
			/^<barmark-score verovio-url="\/engraver\/[\d.]+\/verovio-module\.mjs" verovio-integrity="sha384-[^"]+" verovio-wasm-integrity="sha384-[^"]+" theme="light" rehearsal-letters>/,
		);
		expect(html).toContain('<template shadowrootmode="open">');
		expect(html).toContain('role="radiogroup"');
		expect(html).toContain('data-view="score"');
		expect(html).toContain("Verse");
		expect(html).not.toContain("<barmark-chart");
	});
});

describe("renderScoreChartHtml", () => {
	it("is empty for a blank chart", () => {
		expect(renderScoreChartHtml("  \n")).toBe("");
	});
	it("leaves renderChartHtml the plain grid, with no switch", () => {
		const html = renderChartHtml("## Verse\n| D | A |");
		expect(html).toMatch(/^<barmark-chart /);
		expect(html).not.toContain('role="radiogroup"');
	});
});

describe("columns", () => {
	const chart = "## Verse\n| D | A |\n| G | D A G Bm |";
	it('row puts columns="row" on <barmark-chart>', () => {
		expect(renderChartHtml(chart, { columns: "row" })).toMatch(
			/^<barmark-chart [^>]*columns="row"/,
		);
	});
	it('row puts columns="row" on <barmark-score>, beside the engraver\'s attributes', () => {
		const html = renderScoreChartHtml(chart, { columns: "row" });
		expect(html).toMatch(/^<barmark-score verovio-url="[^"]+"[^>]*columns="row"/);
		expect(html).toMatch(/^<barmark-score [^>]*verovio-wasm-integrity="sha384-[^"]+"/);
	});
	it("shared, or no option, draws exactly what it drew before", () => {
		expect(renderChartHtml(chart, { columns: "shared" })).toBe(renderChartHtml(chart));
		expect(renderScoreChartHtml(chart, { columns: "shared" })).toBe(renderScoreChartHtml(chart));
		expect(renderChartHtml(chart)).not.toMatch(/^<barmark-chart [^>]*columns=/);
		expect(renderScoreChartHtml(chart)).not.toMatch(/^<barmark-score [^>]*columns=/);
	});
});

describe("the self-hosted engraver", () => {
	it("is the version @barmark/score expects, byte for byte (bun run engraver after a bump)", async () => {
		const { createHash } = await import("node:crypto");
		const { readFileSync } = await import("node:fs");
		const dir = `static${ENGRAVER_URL.replace(/\/verovio-module\.mjs$/, "")}`;
		const digest = (file: string) =>
			`sha384-${createHash("sha384")
				.update(readFileSync(`${dir}/${file}`))
				.digest("base64")}`;
		expect(digest("verovio-module.mjs")).toBe(ENGRAVER_CDN_INTEGRITY);
		expect(digest("verovio-module.wasm")).toBe(ENGRAVER_WASM_INTEGRITY);
	});
});
