import { requireEditor, requireSignedIn } from "#lib/server/access.js";
import { docText, docVersion, getSong } from "#lib/server/data.js";
import type { SongDocKind } from "#lib/val/SongDocKindSchema.js";
import { renamedProjectPath } from "#lib/server/slugAlias.js";
import { error, redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/** One editor for every song document; `params.doc` is "chart", "lyrics" or "notes" (see src/params/songDoc.ts). */
export const load: PageServerLoad = async ({ params, parent, locals, url }) => {
	requireSignedIn(locals, url);
	const { account } = await parent();
	requireEditor(locals, account.id); // editing needs membership; the song page shows the read view
	const song = await getSong(account.id, params.project, params.song);
	if (!song) {
		const to = await renamedProjectPath(url, account.id, params.project, params.song);
		if (to) redirect(308, to);
		error(404, `No song "${params.song}" in "${params.project}"`);
	}
	const kind = params.doc as SongDocKind;
	return {
		kind,
		song: { id: song.id, title: song.title, slug: song.slug, project: song.project },
		markdown: docText(song, kind),
		version: docVersion(song, kind),
	};
};
