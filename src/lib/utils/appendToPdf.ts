import { PDFDocument } from "pdf-lib";

/** A page or pages to add after a PDF's own: another PDF's every page, or one image on a page of its size. */
export interface PdfAppendix {
	kind: "pdf" | "image";
	bytes: Uint8Array;
	/** For an image: its type; PNG and JPEG embed, anything else is skipped. */
	contentType?: string;
}

/**
 * The base PDF with the appendices' pages after it (docs/uploads-and-blob.md,
 * "Documentation downloads": a song's notation merged into its documentation,
 * Kevin). pdf-lib copies pages between documents; a part that cannot be read
 * is skipped rather than failing the whole. Returns the base unchanged when
 * nothing could be appended.
 */
export async function appendToPdf(base: Uint8Array, parts: PdfAppendix[]): Promise<Uint8Array> {
	if (parts.length === 0) return base;
	const doc = await PDFDocument.load(base);
	let added = 0;
	for (const part of parts) {
		try {
			if (part.kind === "pdf") {
				const other = await PDFDocument.load(part.bytes, { ignoreEncryption: true });
				const pages = await doc.copyPages(other, other.getPageIndices());
				for (const page of pages) doc.addPage(page);
				added += pages.length;
			} else {
				const type = (part.contentType ?? "").toLowerCase();
				const isPng = type.includes("png") || looksLikePng(part.bytes);
				const isJpeg = type.includes("jpeg") || type.includes("jpg") || looksLikeJpeg(part.bytes);
				if (!isPng && !isJpeg) continue;
				const image = isPng ? await doc.embedPng(part.bytes) : await doc.embedJpg(part.bytes);
				// A4 portrait at 72 dpi, the image fitted inside with a margin.
				const [pw, ph] = [595.28, 841.89];
				const margin = 36;
				const scale = Math.min(
					(pw - 2 * margin) / image.width,
					(ph - 2 * margin) / image.height,
					1,
				);
				const page = doc.addPage([pw, ph]);
				const w = image.width * scale;
				const h = image.height * scale;
				page.drawImage(image, { x: (pw - w) / 2, y: ph - margin - h, width: w, height: h });
				added++;
			}
		} catch {
			// An unreadable part: the rest still goes in.
		}
	}
	return added ? doc.save() : base;
}

const looksLikePng = (b: Uint8Array) =>
	b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47;
const looksLikeJpeg = (b: Uint8Array) =>
	b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff;
