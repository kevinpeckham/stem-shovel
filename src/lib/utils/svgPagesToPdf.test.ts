import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vite-plus/test";
import createVerovioModule from "verovio/wasm";
import { LOG_OFF, VerovioToolkit, enableLog } from "verovio/esm";
import { engraveNotationPages } from "./engraveNotationPages";
import { svgPagesToPdf } from "./svgPagesToPdf";

/** The engine in Node, as engraveNotation.test.ts runs it (notation-samples/README.md). */
const toolkit = createVerovioModule().then((m) => {
	enableLog(LOG_OFF, m);
	return new VerovioToolkit(m);
});
const sample = async (name: string) => {
	const buf = await readFile(new URL(`./notation-samples/${name}`, import.meta.url));
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
};
const latin1 = (bytes: Uint8Array) => Buffer.from(bytes).toString("latin1");
/** Page objects in the file (`/Type /Page`, not the `/Pages` tree): pdfkit writes them uncompressed. */
const pageObjects = (pdf: string) => pdf.match(/\/Type\s*\/Page\b/g)?.length ?? 0;

describe("svgPagesToPdf", () => {
	it("writes an engraved score as one PDF, a page per SVG", async () => {
		const vrv = await toolkit;
		const name = "Happy_Birthday_To_You_C_Major.mxl";
		const { pages, svgs } = engraveNotationPages(vrv, await sample(name), name);
		expect(pages).toBeGreaterThan(0);
		expect(svgs).toHaveLength(pages);
		const pdf = await svgPagesToPdf(svgs);
		expect(latin1(pdf.subarray(0, 5))).toBe("%PDF-");
		expect(pageObjects(latin1(pdf))).toBe(pages);
		// The glyphs came through as drawing, not as nothing: a page with notes is more than a blank one.
		const blank = await svgPagesToPdf([
			'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2100 2970"/>',
		]);
		expect(pdf.length).toBeGreaterThan(blank.length + 1000);
	}, 60_000);
	it("writes a page object per SVG for a multi-page score", async () => {
		const vrv = await toolkit;
		// The samples each fit one A4 page; three of them stand in for a three-page score.
		const name = "Fur_Elise_Easy_Piano.mxl";
		const { svgs } = engraveNotationPages(vrv, await sample(name), name);
		const pdf = await svgPagesToPdf([...svgs, ...svgs, ...svgs]);
		expect(latin1(pdf.subarray(0, 5))).toBe("%PDF-");
		expect(pageObjects(latin1(pdf))).toBe(svgs.length * 3);
	}, 60_000);
	it("refuses an empty list", async () => {
		await expect(svgPagesToPdf([])).rejects.toThrow();
	});
});
