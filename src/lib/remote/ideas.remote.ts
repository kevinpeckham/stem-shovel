import { command, form, getRequestEvent, query } from "$app/server";
import { accountOfIdea, memberOf, requireMember, requireUser } from "$lib/server/access";
import {
	createIdea as create,
	deleteIdea as remove,
	deleteIdeaIfEmpty,
	renameIdea as rename,
	setIdeaNotes,
	userOwnsIdea,
} from "$lib/server/data";
import { renderMarkdown } from "$lib/server/markdown";
import { IdeaCreateSchema, IdeaNotesSchema, IdeaRenameSchema } from "$lib/val/IdeaSchema";
import { IdSchema } from "$lib/val/SongSchema";
import { NanoIdSchema } from "$lib/val/NanoIdSchema";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

/** Ideas from the Idea Recorder (docs/demo-recording.md): a title, a note board, takes. */

/** A new idea in the account (members); the recorder calls it on New idea or the first take. */
export const createIdea = command(
	v.object({ accountId: NanoIdSchema, ...IdeaCreateSchema.entries }),
	async ({ accountId, title }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		requireMember(locals, accountId);
		const row = await create(accountId, user.id, title);
		return { id: row.id, title: row.title };
	},
);

/** The caller's own idea in an account they belong to, else 404. */
async function ownIdea(id: string) {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfIdea, id);
	if (!(await userOwnsIdea(accountId, user.id, id))) error(404, "Idea not found");
	return accountId;
}

export const renameIdea = command(IdeaRenameSchema, async ({ id, title }) => {
	const accountId = await ownIdea(id);
	if (!(await rename(accountId, id, title))) error(404, "Idea not found");
	return { title };
});

/** The note board, saved whole (the editor autosaves on idle). */
/** Saves the notes; clearing them on an idea without takes removes the idea instead. */
export const saveIdeaNotes = command(IdeaNotesSchema, async ({ id, markdown }) => {
	const accountId = await ownIdea(id);
	if (!(await setIdeaNotes(accountId, id, markdown))) error(404, "Idea not found");
	const ideaDeleted = !markdown.trim() && (await deleteIdeaIfEmpty(accountId, id));
	return { saved: true, ideaDeleted };
});

/** Removes the idea if it has neither takes nor notes (after a discarded upload). */
export const dropIdeaIfEmpty = command(IdSchema, async ({ id }) => {
	const accountId = await ownIdea(id);
	return { ideaDeleted: await deleteIdeaIfEmpty(accountId, id) };
});

/** Removes the idea and all its takes (files included); a command for the recorder's menu. */
export const deleteIdeaNow = command(IdSchema, async ({ id }) => {
	const accountId = await ownIdea(id);
	if (!(await remove(accountId, id))) error(404, "Idea not found");
	return { deleted: true };
});

/** Removes the idea and all its takes (files included). */
export const deleteIdea = form(IdSchema, async ({ id }) => {
	const accountId = await ownIdea(id);
	if (!(await remove(accountId, id))) error(404, "Idea not found");
	return { deleted: true };
});

/** The read view of a note board: the same sanitised renderer as the song documents (any signed-in user). */
export const renderNotes = query(v.pipe(v.string(), v.maxLength(50_000)), async (markdown) => {
	requireUser(getRequestEvent().locals);
	return renderMarkdown(markdown);
});
