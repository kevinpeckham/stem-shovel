import { PDFDocument } from "pdf-lib";
import { describe, expect, it } from "vite-plus/test";
import { appendToPdf } from "./appendToPdf";

async function pdfWithPages(n: number): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	for (let i = 0; i < n; i++) doc.addPage([200, 200]);
	return doc.save();
}
const pageCount = async (bytes: Uint8Array) => (await PDFDocument.load(bytes)).getPageCount();
/** A one-pixel PNG. */
const PNG = Uint8Array.from(
	atob(
		"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
	),
	(c) => c.charCodeAt(0),
);

describe("appendToPdf", () => {
	it("appends another PDF's pages and an image page", async () => {
		const base = await pdfWithPages(2);
		const out = await appendToPdf(base, [
			{ kind: "pdf", bytes: await pdfWithPages(3) },
			{ kind: "image", bytes: PNG, contentType: "image/png" },
		]);
		expect(await pageCount(out)).toBe(6);
	});
	it("skips what it cannot read and returns the base when nothing was added", async () => {
		const base = await pdfWithPages(1);
		const out = await appendToPdf(base, [
			{ kind: "pdf", bytes: new TextEncoder().encode("not a pdf") },
			{ kind: "image", bytes: new Uint8Array([1, 2, 3]), contentType: "image/webp" },
		]);
		expect(out).toBe(base);
		expect(await appendToPdf(base, [])).toBe(base);
	});
});
