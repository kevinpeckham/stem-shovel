import { aiAvailable } from "$lib/server/aiDetect";
import { featuredSong, homeBeat, sitePianoPresets } from "$lib/server/data";
import { songView } from "$lib/server/songView";
import type { PageServerLoad } from "./$types";

/** The front page demos a public song (chosen on /admin/home, docs/audio-engine.md), a beat (chosen in the demo itself by a system admin; null is the built-in one) and the piano with the site's presets (docs/piano.md, "Presets"). */
export const load: PageServerLoad = async () => {
	const [row, beat, pianoPresets] = await Promise.all([
		featuredSong(),
		homeBeat(),
		sitePianoPresets(),
	]);
	if (!row) return { demo: null, homeBeat: beat, pianoPresets, textToBeat: aiAvailable() };
	// Real comments stay private to the account: the demo shows examples instead.
	const view = await songView(row);
	return {
		homeBeat: beat,
		pianoPresets,
		textToBeat: aiAvailable(),
		demo: {
			...view,
			comments: [],
			href: `/${row.accountSlug}/projects/${row.project.slug}/${row.slug}`,
		},
	};
};
