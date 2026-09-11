import { listSongs } from "$lib/server/blob";
import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async () => {
	return { songs: await listSongs() };
};
