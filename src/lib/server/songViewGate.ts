import { viewerOf } from "#lib/server/access.js";
import { openShareLinks, projectRoleOf } from "#lib/server/data.js";
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
 * `documentation.pdf`, `chart.musicxml`): the caller's project role when
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
