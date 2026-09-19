import { requireEditor, requireSignedIn } from "$lib/server/access";
import { docText, docVersion, getSong } from "$lib/server/data";
import type { SongDocKind } from "$lib/val/SongDocKindSchema";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** One editor for every song document; `params.doc` is "chart", "lyrics" or "notes" (see src/params/songDoc.ts). */
export const load: PageServerLoad = async ({ params, parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireEditor(locals, account.id); // editing needs membership; the song page shows the read view
	const song = await getSong(account.id, params.project, params.song);
	if (!song) error(404, `No song "${params.song}" in "${params.project}"`);
	const kind = params.doc as SongDocKind;
	return {
		kind,
		song: { id: song.id, title: song.title, slug: song.slug, project: song.project },
		markdown: docText(song, kind),
		version: docVersion(song, kind),
	};
};
