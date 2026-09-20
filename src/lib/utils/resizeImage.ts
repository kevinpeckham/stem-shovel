import { IMAGE_MAX_SIDE } from "$lib/constants/images";

/**
 * Shrinks a picked image in the browser to at most `maxSide` on its longer
 * edge and re-encodes it as WebP (JPEG where WebP is not offered), so what
 * goes to the server is a few hundred KB whatever the phone produced. A
 * file the browser cannot decode comes back as it was, for the server to
 * refuse.
 */
export async function resizeImage(file: File, maxSide = IMAGE_MAX_SIDE): Promise<File> {
	let bitmap: ImageBitmap;
	try {
		bitmap = await createImageBitmap(file);
	} catch {
		return file;
	}
	const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * scale));
	const height = Math.max(1, Math.round(bitmap.height * scale));
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const ctx = canvas.getContext("2d");
	if (!ctx) return file;
	ctx.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();
	const blob =
		(await toBlob(canvas, "image/webp", 0.85)) ?? (await toBlob(canvas, "image/jpeg", 0.85));
	if (!blob) return file;
	const ext = blob.type === "image/webp" ? "webp" : "jpg";
	return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "image"}.${ext}`, {
		type: blob.type,
	});
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
	return new Promise((resolve) => {
		canvas.toBlob((b) => resolve(b && b.type === type ? b : null), type, quality);
	});
}
