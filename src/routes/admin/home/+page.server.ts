import { DEFAULT_FEATURED_SONG, getAppSetting, listPublicSongs } from "$lib/server/data";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
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
	};
};
