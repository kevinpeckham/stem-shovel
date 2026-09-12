import { requireMember } from "$lib/server/access";
import { docText, docVersion, getSong } from "$lib/server/data";
import type { SongDocKind } from "$lib/val/SongDocKindSchema";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** One editor for both song documents; `params.doc` is "chart" or "lyrics" (see src/params/songDoc.ts). */
export const load: PageServerLoad = async ({ params, parent, locals }) => {
	const { account } = await parent();
	requireMember(locals, account.id); // editing needs membership; the song page shows the read view
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
