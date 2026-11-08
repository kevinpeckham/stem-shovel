import { viewerOf } from "#lib/server/access.js";
import { openShareLinks, projectRoleOf, songForDocumentation } from "#lib/server/data.js";
import { canViewSong, shareCodesFrom } from "#lib/server/viewAccess.js";
import { error, type Cookies } from "@sveltejs/kit";

/** What a song's download routes hold of the request. */
export interface SongViewRequest {
	locals: App.Locals;
	url: URL;
	cookies: Pick<Cookies, "get">;
}

/**
 * The gate the song's file routes share (`/api/songs/[id]/mix`,
 * `documentation.pdf`, `chart.musicxml`, `chart.mid`): the caller's project role when
 * signed in, then `canViewSong` with the share codes in the query or the
 * cookie (docs/security.md, "Downloads"). Throws a 403 for a song the
 * caller may not view; `accountId` is passed apart because the mix route's
 * song row carries none.
 */
export async function requireSongView(
	song: Parameters<typeof canViewSong>[0],
	accountId: string,
	{ locals, url, cookies }: SongViewRequest,
): Promise<void> {
	const role = locals.user ? await projectRoleOf(song.projectId, locals.user.id) : null;
	const who = viewerOf(locals, accountId, role ? { [song.projectId]: role } : {});
	if (!canViewSong(song, who, await openShareLinks(shareCodesFrom(url, cookies)))) {
		error(403, "This song is private");
	}
}

/**
 * The song a documentation download builds from (`songForDocumentation`),
 * behind the gate: a 404 for one that does not exist, a 403 for one the
 * caller may not view.
 */
export async function viewableDocumentationSong(id: string, request: SongViewRequest) {
	const song = await songForDocumentation(id);
	if (!song) error(404, "Not found");
	await requireSongView(song, song.accountId, request);
	return song;
}
