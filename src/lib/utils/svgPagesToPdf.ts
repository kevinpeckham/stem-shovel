import PDFDocument from "pdfkit";
import SVGtoPDF from "svg-to-pdfkit";

/** pdfkit's built-in faces: regular, bold, italic, bold italic. */
const FACES = {
	times: ["Times-Roman", "Times-Bold", "Times-Italic", "Times-BoldItalic"],
	helvetica: ["Helvetica", "Helvetica-Bold", "Helvetica-Oblique", "Helvetica-BoldOblique"],
	courier: ["Courier", "Courier-Bold", "Courier-Oblique", "Courier-BoldOblique"],
} as const;

/**
 * The font pdfkit draws an SVG's text with, by family name: one of its
 * built-in fonts, so no font files ship with the function. Verovio sets
 * its text (lyrics, titles, dynamics) in Times; Leipzig is its music
 * font, whose glyphs arrive as paths, never as text. Serifs go to Times,
 * monospace to Courier, the rest to Helvetica.
 */
function fontCallback(family: string, bold: boolean, italic: boolean): string {
	const f = family.toLowerCase();
	const serif = /times|serif|leipzig|georgia|garamond|book|roman/.test(f) && !/sans/.test(f);
	const faces = /courier|mono/.test(f) ? FACES.courier : serif ? FACES.times : FACES.helvetica;
	return faces[(bold ? 1 : 0) + (italic ? 2 : 0)]!;
}

/**
 * One PDF from a list of SVG pages (docs/uploads-and-blob.md, "Notation
 * files"): an A4 page per SVG, each scaled to fit from the top left
 * corner, text in pdfkit's built-in fonts. The SVGs are Verovio's, whose
 * glyphs are `<use>`s of paths in `<defs>`; svg-to-pdfkit resolves those.
 */
export async function svgPagesToPdf(svgs: string[]): Promise<Uint8Array> {
	if (svgs.length === 0) throw new Error("No pages to write");
	const doc = new PDFDocument({ size: "A4", margin: 0, autoFirstPage: false, compress: true });
	const chunks: Buffer[] = [];
	doc.on("data", (chunk: Buffer) => chunks.push(chunk));
	const done = new Promise<void>((resolve, reject) => {
		doc.on("end", resolve);
		doc.on("error", reject);
	});
	for (const svg of svgs) {
		doc.addPage();
		SVGtoPDF(doc, svg, 0, 0, {
			width: doc.page.width,
			height: doc.page.height,
			preserveAspectRatio: "xMinYMin meet",
			fontCallback,
		});
	}
	doc.end();
	await done;
	return new Uint8Array(Buffer.concat(chunks));
}
