import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import createVerovioModule from "verovio/wasm";
import { LOG_OFF, VerovioToolkit, enableLog } from "verovio/esm";
import { engraveNotation } from "./engraveNotation";
import { sanitizeSvg } from "./sanitizeSvg";

/** The engine in Node, once for every sample (notation-samples/README.md). */
const toolkit = createVerovioModule().then((m) => {
	enableLog(LOG_OFF, m);
	return new VerovioToolkit(m);
});
const sample = async (name: string) => {
	const buf = await readFile(new URL(`./notation-samples/${name}`, import.meta.url));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};

describe("engraveNotation", () => {
	it("engraves MuseScore's compressed exports page by page", async () => {
		const vrv = await toolkit;
		for (const name of [
			"Happy_Birthday_To_You_C_Major.mxl",
			"Ode_to_Joy_Easy_variation.mxl",
			"Fur_Elise_Easy_Piano.mxl",
		]) {
			const { pages, svgs } = engraveNotation(vrv, await sample(name), name, { width: 800 });
			expect(pages, name).toBeGreaterThan(0);
			expect(svgs, name).toHaveLength(pages);
			for (const svg of svgs) {
				expect(svg).toMatch(/^<svg/);
				expect(svg).toContain('class="note');
				expect(svg).toContain("viewBox=");
				// Nothing to strip from the engine's own SVG.
				expect(sanitizeSvg(svg)).toBe(svg);
			}
		}
	}, 60_000);
	it("renders only the first page for a thumbnail", async () => {
		const vrv = await toolkit;
		const name = "Fur_Elise_Easy_Piano.mxl";
		const whole = engraveNotation(vrv, await sample(name), name, { width: 480 });
		const first = engraveNotation(vrv, await sample(name), name, {
			width: 480,
			firstPageOnly: true,
		});
		expect(first.pages).toBe(whole.pages);
		expect(first.svgs).toHaveLength(1);
	}, 60_000);
	it("lays out wider for a wider panel", async () => {
		const vrv = await toolkit;
		const name = "Happy_Birthday_To_You_C_Major.mxl";
		const narrow = engraveNotation(vrv, await sample(name), name, { width: 400 });
		const wide = engraveNotation(vrv, await sample(name), name, { width: 1200 });
		const widthOf = (svg: string) => Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1]);
		expect(widthOf(wide.svgs[0])).toBeGreaterThan(widthOf(narrow.svgs[0]));
	}, 60_000);
	it("refuses what is not notation", async () => {
		const vrv = await toolkit;
		const junk = new TextEncoder().encode("<html>no</html>").buffer as ArrayBuffer;
		expect(() => engraveNotation(vrv, junk, "x.musicxml", { width: 800 })).toThrow();
	}, 60_000);
});
