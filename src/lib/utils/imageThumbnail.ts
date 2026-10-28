/**
 * A picked image as a small WebP for a tile or a gallery (an event's poster
 * and photos), at most `maxEdge` on its longer side, with the original's
 * pixel size: the server stores the thumbnail beside the file and the size
 * with the row, so the page never decodes the full picture to lay it out.
 * Null when the browser cannot decode the file (HEIC outside Safari, a
 * broken file) or has no canvas; the upload goes on without a thumbnail.
 */
export async function imageThumbnail(
	file: File,
	maxEdge = 640,
): Promise<{ image: Blob; width: number; height: number } | null> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return null;
	}
	try {
		const { width, height } = bitmap;
		if (!width || !height) return null;
		const scale = Math.min(1, maxEdge / Math.max(width, height));
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round(width * scale));
		canvas.height = Math.max(1, Math.round(height * scale));
		const ctx = canvas.getContext("2d");
		if (!ctx) return null;
		ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
		const image = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob((b) => resolve(b), "image/webp", 0.82),
		);
		return image ? { image, width, height } : null;
	} catch {
		return null;
	} finally {
		bitmap.close();
	}
}
