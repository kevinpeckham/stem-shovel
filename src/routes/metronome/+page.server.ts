import { pageCopy } from "#lib/server/pageCopy.js";
import copyFallback from "../../../scripts/user-docs/metronome-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The metronome page: usable by anyone, signed in or not. Its words (title,
 * intro, the tips under the metronome) come from its copy doc, edited in
 * the app (docs/page-copy.md).
 */
export const load: PageServerLoad = async ({ locals }) => {
	return { copy: await pageCopy("metronome-page", copyFallback, locals) };
};
