import { fileThumbnailPathname, putBlob } from "#lib/server/blob.js";
import { accessOfPathname } from "#lib/server/relocate.js";
import { PDF_THUMBNAIL_MAX_BYTES } from "#lib/constants/fileFormats.js";
import { imageTypeOfBytes } from "#lib/utils/fileSignatures.js";
import { error } from "@sveltejs/kit";

/**
 * Step 3 of an upload as the browser posts it (the ready routes of
 * attachments, notation files and event files): the form, the blob URL it
 * reports (400 unless an https URL) and the thumbnail field, when it sent one.
 */
export async function readyFormOf(
	request: Request,
): Promise<{ form: FormData; url: string; thumbnail: FormDataEntryValue | null }> {
	const form = await request.formData();
	const url = form.get("url");
	if (typeof url !== "string" || !url.startsWith("https://")) error(400, "url is required");
	return { form, url, thumbnail: form.get("thumbnail") };
}

/** The page count the browser laid out: a whole number under 10,000, else null. */
export function pageCountOf(form: FormData): number | null {
	const pagesRaw = Number(form.get("pageCount"));
	return Number.isInteger(pagesRaw) && pagesRaw > 0 && pagesRaw < 10_000 ? pagesRaw : null;
}

/**
 * The browser's thumbnail of a file (a WebP or PNG, checked by its bytes),
 * stored beside the file in the file's store; nulls when it sent none or
 * the bytes are neither. 413 over the ceiling.
 */
export async function storeFileThumbnail(
	thumbnail: FormDataEntryValue | null,
	pathname: string,
): Promise<{ thumbnailUrl: string | null; thumbnailPathname: string | null }> {
	if (!(thumbnail instanceof File) || thumbnail.size === 0) {
		return { thumbnailUrl: null, thumbnailPathname: null };
	}
	if (thumbnail.size > PDF_THUMBNAIL_MAX_BYTES) error(413, "The thumbnail is too large");
	const bytes = new Uint8Array(await thumbnail.arrayBuffer());
	const type = imageTypeOfBytes(bytes);
	if (!type) return { thumbnailUrl: null, thumbnailPathname: null };
	const thumbnailPathname = fileThumbnailPathname(pathname, type === "image/webp" ? "webp" : "png");
	const put = await putBlob(
		thumbnailPathname,
		Buffer.from(bytes),
		type,
		await accessOfPathname(pathname),
	);
	return { thumbnailUrl: put.url, thumbnailPathname };
}
