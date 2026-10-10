import { pageCopy } from "#lib/server/pageCopy.js";
import copyFallback from "../../../scripts/user-docs/practice-amp-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The Practice Amp (docs/practice-amp.md): usable by anyone, signed in or
 * not; its settings stay in the browser. Its words come from its copy
 * doc, edited in the app (docs/page-copy.md).
 */
export const load: PageServerLoad = async ({ locals }) => {
	return { copy: await pageCopy("practice-amp-page", copyFallback, locals) };
};
