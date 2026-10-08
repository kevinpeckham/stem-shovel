import { aiAvailable } from "#lib/server/aiDetect.js";
import {
	featuredSong,
	homeBeat,
	sitePianoPresets,
	listDrumKitManifests,
} from "#lib/server/data.js";
import { songView } from "#lib/server/songView.js";
import type { PageServerLoad } from "./$types";

/** The front page demos a public song (chosen on /admin/home, docs/audio-engine.md), a beat (chosen in the demo itself by a system admin; null is the built-in one), the piano and the chord player, each with the site's presets for it (docs/piano.md, "Presets"). */
export const load: PageServerLoad = async () => {
	const kits = await listDrumKitManifests(null);
	const [row, beat, pianoPresets, chordPresets] = await Promise.all([
		featuredSong(),
		homeBeat(),
		sitePianoPresets(),
		sitePianoPresets("chords"),
	]);
	if (!row)
		return {
			demo: null,
			homeBeat: beat,
			pianoPresets,
			chordPresets,
			kits,
			textToBeat: aiAvailable(),
		};
	// Real comments stay private to the account: the demo shows examples instead.
	const view = await songView(row);
	return {
		homeBeat: beat,
		kits,
		pianoPresets,
		chordPresets,
		textToBeat: aiAvailable(),
		demo: {
			...view,
			comments: [],
			href: `/${row.accountSlug}/projects/${row.project.slug}/${row.slug}`,
		},
	};
};
