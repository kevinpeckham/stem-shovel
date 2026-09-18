import { page } from "$app/state";

/** What the tab says about the stage: nothing on production, a tag elsewhere so a dev or staging tab is never mistaken for the real thing. */
const STAGE_TAG: Record<string, string> = { development: "DEV | ", preview: "STAGE | " };

/**
 * The document title: `<stage tag><text> - Stem Shovel`, or the text alone
 * with the tag when `bare` (the front page names the brand itself). The
 * stage comes from the root layout's data (`APP_ENV`).
 */
export function pageTitle(text: string, bare = false): string {
	const stage = (page.data as { stage?: string }).stage ?? "production";
	const tag = STAGE_TAG[stage] ?? "";
	return bare ? `${tag}${text}` : `${tag}${text} - Stem Shovel`;
}
