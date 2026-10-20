import { isEditor } from "#lib/server/access.js";
import {
	DEFAULT_FEATURED_SONG,
	getAppSetting,
	homeBeat,
	homeStudioSong,
	listPublicSongs,
	listStudioSongs,
} from "#lib/server/data.js";
import { realMemberships } from "#lib/utils/actingMemberships.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async ({ locals }) => {
	const editing = realMemberships(locals.memberships).filter((m) => isEditor(m.role));
	const studioDemo = await homeStudioSong();
	const songs = await listPublicSongs();
	const defaultPath = `/${DEFAULT_FEATURED_SONG.account}/projects/${DEFAULT_FEATURED_SONG.project}/${DEFAULT_FEATURED_SONG.song}`;
	return {
		songs,
		// The chosen song, else the default the home page falls back to (pre-selected).
		featuredId:
			(await getAppSetting("featuredSongId")) ??
			songs.find((s) => s.path === defaultPath)?.id ??
			null,
		defaultPath,
		// The drum machine demo's starting beat, when an admin has chosen one from the demo itself.
		homeBeat: await homeBeat(),
		// The Dawn demo (docs/multitrack-recorder.md, "The home demo"): the chosen Dawn song, and the admin's own to choose from.
		studioDemo: studioDemo ? { id: studioDemo.id, title: studioDemo.title } : null,
		studioSongs: locals.user
			? (
					await listStudioSongs(
						locals.user.id,
						editing.map((m) => m.accountId),
					)
				).map((s) => ({ id: s.id, title: s.title, tracks: s.current?.tracks.length ?? 0 }))
			: [],
	};
};
