import { form, getRequestEvent } from "$app/server";
import { accountOfArtist, accountOfSong, memberOf, requireEditor } from "$lib/server/access";
import { deleteBlobs, imagePathname, putBlob } from "$lib/server/blob";
import { setImage as store } from "$lib/server/data";
import { accessOfSongId } from "$lib/server/relocate";
import { ImageRemoveSchema, ImageSetSchema, type ImageKind } from "$lib/val/ImageSchema";
import { error } from "@sveltejs/kit";

/**
 * Pictures for an account, an artist or a song. The browser resizes before
 * sending (src/lib/utils/resizeImage.ts); the server stores the file in
 * Blob under the account (a song's in the private store when the song is
 * private), points the row at it, and deletes the one before.
 */

async function editorOf(kind: ImageKind, id: string) {
	const { locals } = getRequestEvent();
	if (kind === "account") return requireEditor(locals, id);
	return memberOf(locals, kind === "artist" ? accountOfArtist : accountOfSong, id);
}

const EXT: Record<string, string> = {
	"image/webp": "webp",
	"image/jpeg": "jpg",
	"image/png": "png",
};

export const setImage = form(ImageSetSchema, async ({ kind, id, image }) => {
	const { accountId } = await editorOf(kind, id);
	const access = kind === "song" ? ((await accessOfSongId(id)) ?? "public") : "public";
	const pathname = imagePathname(kind, accountId, id, EXT[image.type] ?? "img");
	const blob = await putBlob(pathname, Buffer.from(await image.arrayBuffer()), image.type, access);
	const previous = await store(kind, accountId, id, blob.url);
	if (previous === undefined) {
		await deleteBlobs([blob.url]);
		error(404, "Not found");
	}
	if (previous) await deleteBlobs([previous]);
	return { url: blob.url };
});

export const removeImage = form(ImageRemoveSchema, async ({ kind, id }) => {
	const { accountId } = await editorOf(kind, id);
	const previous = await store(kind, accountId, id, null);
	if (previous === undefined) error(404, "Not found");
	if (previous) await deleteBlobs([previous]);
	return { removed: true };
});
