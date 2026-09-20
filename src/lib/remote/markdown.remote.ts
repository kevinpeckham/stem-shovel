import { getRequestEvent, query } from "$app/server";
import { renderMarkdown } from "$lib/server/markdown";
import { MINUTE, rateLimited } from "$lib/server/rateLimit";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

/**
 * Renders markdown for a page that keeps its text to itself: the front
 * page's documents demo, where a visitor edits the chart and nothing is
 * saved. Open to anyone, so it is rate limited by address.
 */
export const renderPreview = query(v.pipe(v.string(), v.maxLength(50_000)), async (markdown) => {
	const { getClientAddress } = getRequestEvent();
	if (await rateLimited(`render:${getClientAddress()}`, 60, MINUTE))
		error(429, "Too many previews for the moment; try again in a minute.");
	return renderMarkdown(markdown);
});
