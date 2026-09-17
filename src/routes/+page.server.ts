import { featuredSong } from "$lib/server/data";
import { songView } from "$lib/server/songView";
import type { PageServerLoad } from "./$types";

/** The front page demos a public song (chosen on /admin/home, docs/audio-engine.md). */
export const load: PageServerLoad = async () => {
	const row = await featuredSong();
	if (!row) return { demo: null };
	// Real comments stay private to the account: the demo shows examples instead.
	const view = await songView(row);
	return {
		demo: {
			...view,
			comments: [],
			href: `/${row.accountSlug}/projects/${row.project.slug}/${row.slug}`,
		},
	};
};
