import { readFileSync } from "node:fs";
import { fontFaceCss } from "@barmark/render";
import { describe, expect, it } from "vite-plus/test";

// app.html registers Edwin once per page as a literal `<style data-barmark-font>`;
// these keep that literal and the served font file in step with the installed package.
describe("barmark's chart font", () => {
	it("app.html holds exactly the rule fontFaceCss produces", () => {
		const html = readFileSync("src/app.html", "utf8");
		const css = fontFaceCss("/fonts/barmark/Edwin-Roman.otf");
		expect(html).toContain(`<style data-barmark-font>${css}</style>`);
	});
	it("static/fonts/barmark serves the package's own Edwin", () => {
		const served = readFileSync("static/fonts/barmark/Edwin-Roman.otf");
		const packaged = readFileSync("node_modules/@barmark/render/fonts/Edwin-Roman.otf");
		expect(served.equals(packaged)).toBe(true);
	});
});
