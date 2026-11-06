import { songsWantingChordsAdmin, stemStreaming } from "#lib/server/data.js";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	const [mode, chords] = await Promise.all([stemStreaming(), songsWantingChordsAdmin(0)]);
	return { mode, wantingChords: chords.count };
};
