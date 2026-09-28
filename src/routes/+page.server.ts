import { featuredSong, homeBeat } from "$lib/server/data";
import { songView } from "$lib/server/songView";
import type { PageServerLoad } from "./$types";

/** The front page demos a public song (chosen on /admin/home, docs/audio-engine.md) and a beat (chosen in the demo itself by a system admin; null is the built-in one). */
export const load: PageServerLoad = async () => {
	const [row, beat] = await Promise.all([featuredSong(), homeBeat()]);
	if (!row) return { demo: null, homeBeat: beat };
	// Real comments stay private to the account: the demo shows examples instead.
	const view = await songView(row);
	return {
		homeBeat: beat,
		demo: {
			...view,
			comments: [],
			href: `/${row.accountSlug}/projects/${row.project.slug}/${row.slug}`,
		},
	};
};
