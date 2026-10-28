import { eventPage } from "#lib/server/data.js";
import { memberPageAccount } from "#lib/server/memberPageAccount.js";
import { renderMarkdown } from "#lib/server/markdown.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

/**
 * A show or practice (docs/band-plan.md, "Event"): members only. A viewer
 * of the account reads it (the page leaves the controls out by `canEdit`);
 * everyone else gets a 404. Its sets, the sessions that taped it, the
 * choices for attaching more, and the notes rendered for reading.
 */
export const load: PageServerLoad = async (event) => {
	const account = await memberPageAccount(event);
	const found = await eventPage(account.id, event.params.id);
	if (!found) error(404, "Not found");
	return { ...found, notesHtml: renderMarkdown(found.event.notes) };
};
