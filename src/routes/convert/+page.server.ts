import { pageCopy } from "#lib/server/pageCopy.js";
import copyFallback from "../../../scripts/user-docs/convert-page.md?raw";
import type { PageServerLoad } from "./$types";

/**
 * The converter page (docs/dawproject-plan.md "Roadmap"): usable by
 * anyone, signed in or not; the file never leaves the browser. Its words
 * come from its copy doc, edited in the app (docs/page-copy.md).
 */
export const load: PageServerLoad = async ({ locals }) => {
	return { copy: await pageCopy("convert-page", copyFallback, locals) };
};
