import { viewerOf } from "#lib/server/access.js";
import { openShareLinks, projectRoleOf, songForDocumentation } from "#lib/server/data.js";
import {
	hasDocumentation,
	notationPartsOf,
	songDocumentationPdf,
} from "#lib/server/documentation.js";
import { canViewSong, shareCodesFrom } from "#lib/server/viewAccess.js";
import { attachmentDisposition } from "#lib/utils/attachmentDisposition.js";
import type { Config } from "@sveltejs/adapter-vercel";
import { error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

/** Rendering is a second or two; the budget covers a long chart on a cold function. */
export const config: Config = { maxDuration: 120 };

/**
 * A song's lyrics, chart and notes as one PDF (docs/uploads-and-blob.md,
 * "Documentation downloads"), built on demand and sent as an attachment
 * named after the song. Viewable like the song itself: a private one needs
 * membership or a share code (the cookie rides along). A song with no text
 * in any of the three is a 404, as is one that does not exist.
 */
export const GET: RequestHandler = async ({ params, url, locals, cookies }) => {
	const song = await songForDocumentation(params.id);
	if (!song) error(404, "Not found");
	const role = locals.user ? await projectRoleOf(song.projectId, locals.user.id) : null;
	const who = viewerOf(locals, song.accountId, role ? { [song.projectId]: role } : {});
	if (!canViewSong(song, who, await openShareLinks(shareCodesFrom(url, cookies)))) {
		error(403, "This song is private");
	}
	const notation = await notationPartsOf(song);
	if (!hasDocumentation(song, notation.length))
		error(404, "This song has no lyrics, chart, notes or notation yet.");
	const bytes = await songDocumentationPdf({ ...song, projectName: song.project.name }, notation);
	return new Response(new Uint8Array(bytes), {
		headers: {
			"content-type": "application/pdf",
			"content-length": String(bytes.byteLength),
			"content-disposition": attachmentDisposition(`${song.title}.pdf`),
			"cache-control": "private, no-store",
		},
	});
};
