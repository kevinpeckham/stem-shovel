import { renderNotation } from "./renderNotation";

/**
 * The first page of a notation file as a small WebP, drawn from Verovio's
 * SVG in the browser at upload time (as pdfThumbnail does for a PDF): the
 * server stores the image beside the file and never opens the XML. No page
 * count: a score's pages depend on the width it is laid out for. A file
 * the engine cannot read gives null and the upload goes on without a
 * thumbnail.
 */
const WIDTH = 480;
export async function notationThumbnail(
	file: File,
): Promise<{ blob: Blob; pageCount: number | null } | null> {
	try {
		const { svgs } = await renderNotation(await file.arrayBuffer(), file.name, {
			width: WIDTH,
			scale: 40,
			firstPageOnly: true,
		});
		const svg = svgs[0];
		if (!svg) return null;
		const image = new Image();
		const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
		try {
			await new Promise<void>((resolve, reject) => {
				image.onload = () => resolve();
				image.onerror = () => reject(new Error("The page's SVG did not load"));
				image.src = url;
			});
			const ratio = image.naturalHeight / Math.max(1, image.naturalWidth);
			const canvas = document.createElement("canvas");
			canvas.width = WIDTH;
			canvas.height = Math.min(Math.round(WIDTH * 1.4), Math.max(64, Math.round(WIDTH * ratio)));
			const ctx = canvas.getContext("2d");
			if (!ctx) return null;
			ctx.fillStyle = "#fff";
			ctx.fillRect(0, 0, canvas.width, canvas.height);
			ctx.drawImage(image, 0, 0, WIDTH, Math.round(WIDTH * ratio));
			const blob = await new Promise<Blob | null>((resolve) =>
				canvas.toBlob((b) => resolve(b), "image/webp", 0.8),
			);
			return blob ? { blob, pageCount: null } : null;
		} finally {
			URL.revokeObjectURL(url);
		}
	} catch {
		return null;
	}
}
