import type { VerovioToolkit } from "verovio/esm";

/** Paper sizes in Verovio's units at scale 100 (its defaults are A4: 2100 × 2970). */
const NOTATION_PAPER = {
	a4: { width: 2100, height: 2970 },
} as const;
type NotationPaper = keyof typeof NOTATION_PAPER;

/**
 * A MusicXML file (a `.mxl` zip, or the XML itself) laid out by Verovio
 * for paper: fixed pages at full engraving scale, as many as the score
 * needs, every page as SVG sized by its viewBox. The jobs function turns
 * them into a PDF (`svgPagesToPdf`, docs/uploads-and-blob.md "Notation
 * files"); `engraveNotation` is the screen layout, one tall page for a
 * width. Same engine either way, so the Node test runs the real thing.
 */
export function engraveNotationPages(
	vrv: VerovioToolkit,
	bytes: ArrayBuffer,
	name: string,
	options: { paper?: NotationPaper } = {},
): { pages: number; svgs: string[] } {
	const paper = NOTATION_PAPER[options.paper ?? "a4"];
	vrv.setOptions({
		scale: 100,
		pageWidth: paper.width,
		pageHeight: paper.height,
		adjustPageHeight: false,
		breaks: "auto",
		svgViewBox: true,
		svgHtml5: false,
		footer: "none",
		header: "auto",
		justifyVertically: false,
	});
	const loaded = /\.mxl$/i.test(name)
		? vrv.loadZipDataBuffer(bytes)
		: vrv.loadData(new TextDecoder().decode(bytes));
	if (!loaded) throw new Error("Verovio could not read the file");
	const pages = vrv.getPageCount();
	if (pages < 1) throw new Error("The file has no pages");
	const svgs: string[] = [];
	for (let p = 1; p <= pages; p++) svgs.push(vrv.renderToSVG(p));
	return { pages, svgs };
}
