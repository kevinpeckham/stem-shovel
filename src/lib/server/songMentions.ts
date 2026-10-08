import { songMentionSources } from "#lib/server/data.js";
import { linkMentions } from "#lib/utils/linkMentions.js";
import { mentionTargets } from "#lib/utils/mentionTargets.js";

/**
 * `@name` in a song document's rendered HTML linked to the song's
 * attachments, notation files and demos (docs/uploads-and-blob.md,
 * "Mentions"): what saveDoc and a restore answer with, so the page shows
 * the saved text without a reload.
 */
export async function withSongMentions(accountId: string, songId: string, html: string) {
	if (!html.includes("@")) return html;
	return linkMentions(html, mentionTargets(await songMentionSources(accountId, songId)));
}
