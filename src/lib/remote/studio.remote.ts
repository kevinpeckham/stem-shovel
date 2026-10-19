import { command, getRequestEvent, query } from "$app/server";
import { requireEditor, requireStudioAccess, requireUser } from "#lib/server/access.js";
import {
	createIdea,
	deleteStudioRevision as removeRevision,
	deleteStudioSource as removeSource,
	renameStudioRevision as renameRevision,
	restoreStudioRevision as restoreRevision,
	saveStudioAutosave,
	saveStudioRevision as saveRevision,
	setStudioShared as setShared,
	studioRevisionData as revisionData,
	studioRevisionOwner,
	studioSongView,
	studioSourceOwner,
} from "#lib/server/data.js";
import { background } from "#lib/server/background.js";
import { notifyStudioShared } from "#lib/server/notifications.js";
import { NameSchema } from "#lib/val/NameSchema.js";
import { NanoIdSchema } from "#lib/val/NanoIdSchema.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import {
	StudioAutosaveSchema,
	StudioRevisionRenameSchema,
	StudioRevisionSaveSchema,
	StudioShareSchema,
} from "#lib/val/StudioSchema.js";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

/**
 * The Studio (docs/multitrack-recorder.md): a song is an idea of kind
 * "song", so renaming it, its notes and deleting it go through
 * ideas.remote (renameIdea, saveIdeaNotes, deleteIdeaNow); here are the
 * arrangement's revisions and the sources' housekeeping.
 */

/** A song the caller may work on, else 404: their own, or one shared with the band in an account they edit (D7). */
const ownIdea = (id: string) => requireStudioAccess(getRequestEvent().locals, id);

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
export const autosaveArrangement = command(StudioAutosaveSchema, async ({ ideaId, data, base }) => {
	const { accountId, userId } = await ownIdea(ideaId);
	const saved = await saveStudioAutosave(accountId, userId, ideaId, data, base);
	if (!saved) error(404, "Song not found");
	return saved;
});

/** Shares a song with the band or takes it back: the creator's call; the band hears when it opens up. */
export const setStudioShared = command(StudioShareSchema, async ({ ideaId, shared }) => {
	const { accountId, userId, own } = await ownIdea(ideaId);
	if (!own) error(403, "Only the song's creator can share it");
	if (!(await setShared(accountId, ideaId, shared))) error(404, "Song not found");
	if (shared) background(() => notifyStudioShared(accountId, ideaId, userId));
	return { shared };
});

/** A revision's arrangement, for "Compare with now" (utils/diffArrangements.ts). */
export const studioRevisionData = query(IdSchema, async ({ id }) => {
	const { accountId } = await ownRevision(id);
	const data = await revisionData(accountId, id);
	if (!data) error(404, "Revision not found");
	return data;
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
	const { accountId, userId } = await ownIdea(id);
	const song = await studioSongView(accountId, id, userId);
	if (!song) error(404, "Song not found");
	return song;
});
