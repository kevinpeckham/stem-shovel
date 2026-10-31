import { getRequestEvent, query } from "$app/server";
import { renderDocHtml } from "#lib/server/chartHtml.js";
import { MINUTE, rateLimited } from "#lib/server/rateLimit.js";
import { RenderPreviewSchema } from "#lib/val/RenderPreviewSchema.js";
import { error } from "@sveltejs/kit";

/**
 * Renders markdown for a page that keeps its text to itself: the front
 * page's documents demo, where a visitor edits the chart and nothing is
 * saved. The chart gets barmark's renderer, the other documents markdown.
 * Open to anyone, so it is rate limited by address.
 */
export const renderPreview = query(RenderPreviewSchema, async ({ markdown, kind }) => {
	const { getClientAddress } = getRequestEvent();
	if (await rateLimited(`render:${getClientAddress()}`, 60, MINUTE))
		error(429, "Too many previews for the moment; try again in a minute.");
	return renderDocHtml(kind, markdown);
});
