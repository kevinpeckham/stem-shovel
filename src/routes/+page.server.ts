import { aiAvailable } from "#lib/server/aiDetect.js";
import {
	featuredSong,
	homeBeat,
	homeStudioSong,
	sitePianoPresets,
	listDrumKitManifests,
} from "#lib/server/data.js";
import { homeCopy } from "#lib/server/homeCopy.js";
import { songView } from "#lib/server/songView.js";
import copyFallback from "../../scripts/user-docs/home-page.md?raw";
import type { PageServerLoad } from "./$types";

/** The front page demos a public song (chosen on /admin/home, docs/audio-engine.md), a beat (chosen in the demo itself by a system admin; null is the built-in one), the piano and the chord player, each with the site's presets for it (docs/piano.md, "Presets"); its words are the "home-page" copy doc (docs/page-copy.md). */
export const load: PageServerLoad = async ({ locals }) => {
	const kits = await listDrumKitManifests(null);
	const [row, beat, pianoPresets, chordPresets, copy, studioDemo] = await Promise.all([
		featuredSong(),
		homeBeat(),
		sitePianoPresets(),
		sitePianoPresets("chords"),
		homeCopy(copyFallback, locals),
		// The Dawn demo (docs/multitrack-recorder.md, "The home demo"): a Dawn song chosen on /admin/home.
		homeStudioSong(),
	]);
	if (!row)
		return {
			copy,
			demo: null,
			studioDemo,
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
		copy,
		studioDemo,
		demo: {
			...view,
			comments: [],
			href: `/${row.accountSlug}/projects/${row.project.slug}/${row.slug}`,
		},
	};
};
