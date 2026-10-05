import { PDF_THUMBNAIL_WIDTH } from "$lib/constants/pdfFormats";

/**
 * The first page of a PDF as a small image, rendered in the browser with
 * pdf.js at upload time (docs/uploads-and-blob.md, "PDFs"), and the page
 * count: the server stores the image beside the file and never has to
 * open a PDF itself. pdf.js and its worker load on first use only. A file
 * pdf.js cannot open gives null; the upload goes on without a thumbnail
 * (the server still checks the bytes).
 */
export async function pdfThumbnail(file: File): Promise<{ image: Blob; pageCount: number } | null> {
	try {
		const pdfjs = await import("pdfjs-dist");
		const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
		pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
		const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
		const doc = await task.promise;
		const page = await doc.getPage(1);
		const base = page.getViewport({ scale: 1 });
		const viewport = page.getViewport({ scale: PDF_THUMBNAIL_WIDTH / base.width });
		const canvas = document.createElement("canvas");
		canvas.width = Math.round(viewport.width);
		canvas.height = Math.round(viewport.height);
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		await page.render({ canvasContext: ctx, viewport, canvas }).promise;
		const image = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob((b) => resolve(b), "image/webp", 0.8),
		);
		const pageCount = doc.numPages;
		await task.destroy();
		return image ? { image, pageCount } : null;
	} catch {
		return null;
	}
}
