import { command, getRequestEvent, query } from "$app/server";
import { requireEditor, requireOwnIdea, requireUser } from "#lib/server/access.js";
import {
	createIdea,
	deleteStudioRevision as removeRevision,
	deleteStudioSource as removeSource,
	renameStudioRevision as renameRevision,
	restoreStudioRevision as restoreRevision,
	saveStudioAutosave,
	saveStudioRevision as saveRevision,
	studioRevisionOwner,
	studioSongView,
	studioSourceOwner,
} from "#lib/server/data.js";
import { NameSchema } from "#lib/val/NameSchema.js";
import { NanoIdSchema } from "#lib/val/NanoIdSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import {
	StudioAutosaveSchema,
	StudioRevisionRenameSchema,
	StudioRevisionSaveSchema,
} from "#lib/val/StudioSchema.js";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

/**
 * The Studio (docs/multitrack-recorder.md): a song is an idea of kind
 * "song", so renaming it, its notes and deleting it go through
 * ideas.remote (renameIdea, saveIdeaNotes, deleteIdeaNow); here are the
 * arrangement's revisions and the sources' housekeeping.
 */

/** The caller's own song, else 404: ideas are the user's own, whichever account holds their files. */
const ownIdea = (id: string) => requireOwnIdea(getRequestEvent().locals, id);

/** A new song in the account (members); the Studio calls it on New song or the first take. */
export const createStudioSong = command(
	v.object({ accountId: NanoIdSchema, title: NameSchema }),
	async ({ accountId, title }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		requireEditor(locals, accountId);
		const row = await createIdea(accountId, user.id, title, "song");
		return { id: row.id, title: row.title };
	},
);

/** The current arrangement, debounced by the browser: an unnamed revision when it changed, nothing otherwise. */
export const autosaveArrangement = command(StudioAutosaveSchema, async ({ ideaId, data }) => {
	const { accountId, userId } = await ownIdea(ideaId);
	const saved = await saveStudioAutosave(accountId, userId, ideaId, data);
	if (!saved) error(404, "Song not found");
	return saved;
});

/** The current arrangement kept under a name, for good. */
export const saveStudioRevision = command(
	StudioRevisionSaveSchema,
	async ({ ideaId, name, data }) => {
		const { accountId, userId } = await ownIdea(ideaId);
		const revision = await saveRevision(accountId, userId, ideaId, name, data);
		if (!revision) error(404, "Song not found");
		return revision;
	},
);

/** The caller's own revision (through its song), else 404. */
async function ownRevision(id: string) {
	const owner = await studioRevisionOwner(id);
	if (!owner) error(404, "Revision not found");
	await ownIdea(owner.ideaId);
	return owner;
}

export const renameStudioRevision = command(StudioRevisionRenameSchema, async ({ id, name }) => {
	const { accountId } = await ownRevision(id);
	if (!(await renameRevision(accountId, id, name))) error(404, "Revision not found");
	return { name };
});

/** Removes a named revision; the newest one (the current arrangement) and autosaves are refused, so `deleted` is false for those. */
export const deleteStudioRevision = command(IdSchema, async ({ id }) => {
	const { accountId } = await ownRevision(id);
	return { deleted: await removeRevision(accountId, id) };
});

/** Restores a revision as a new autosave and hands its arrangement back for the browser to load. */
export const restoreStudioRevision = command(IdSchema, async ({ id }) => {
	const owner = await ownRevision(id);
	const { userId } = await ownIdea(owner.ideaId);
	const restored = await restoreRevision(owner.accountId, userId, id);
	if (!restored) error(404, "Revision not found");
	return restored;
});

/** Removes a source and its file ("Clean up unused sources"); the browser drops the clips that named it first. */
export const deleteStudioSource = command(IdSchema, async ({ id }) => {
	const owner = await studioSourceOwner(id);
	if (!owner) error(404, "Source not found");
	await ownIdea(owner.ideaId);
	return { deleted: await removeSource(owner.accountId, id) };
});

/** One song as the page loads it, fresh (after an upload or a save). */
export const studioSong = query(IdSchema, async ({ id }) => {
	const { accountId } = await ownIdea(id);
	const song = await studioSongView(accountId, id);
	if (!song) error(404, "Song not found");
	return song;
});
