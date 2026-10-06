import type { VerovioToolkit } from "verovio/esm";

/**
 * A MusicXML file (a `.mxl` zip, or the XML itself) laid out by Verovio
 * for a width in CSS pixels at an engraving scale, every page as SVG sized
 * by its viewBox (docs/uploads-and-blob.md, "Notation"). The notation
 * worker calls it in the browser; the test calls it in Node with the same
 * engine. Verovio's page width is in its own units at scale 100, so a CSS
 * pixel is 100/scale of them.
 */
export function engraveNotation(
	vrv: VerovioToolkit,
	bytes: ArrayBuffer,
	name: string,
	options: { width: number; scale?: number; firstPageOnly?: boolean },
): { pages: number; svgs: string[] } {
	const scale = options.scale ?? 40;
	vrv.setOptions({
		scale,
		pageWidth: Math.round((Math.max(320, options.width) * 100) / scale),
		pageHeight: 60000,
		adjustPageHeight: true,
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
	for (let p = 1; p <= (options.firstPageOnly ? 1 : pages); p++) svgs.push(vrv.renderToSVG(p));
	return { pages, svgs };
}
