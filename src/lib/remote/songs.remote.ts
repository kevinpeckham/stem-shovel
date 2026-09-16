import { command, form, getRequestEvent } from "$app/server";
import { SongChangesSaveSchema } from "$lib/val/SongChangeSchema";
import { SongSectionsSaveSchema } from "$lib/val/SongSectionSchema";
import { ShareSongSchema } from "$lib/val/ShareSongSchema";
import { sendShareEmail } from "$lib/server/email";
import { scheduleMix } from "$lib/server/mix";
import {
	accountOfProject,
	accountOfDemo,
	accountOfSong,
	accountOfStem,
	memberOf,
	requireUser,
} from "$lib/server/access";
import {
	createSong as create,
	deleteSong as removeSong,
	deleteStem as removeStem,
	deleteDemo as removeDemo,
	projectSlugs,
	removeStemMidi as dropMidi,
	renameStem as rename,
	saveSongDoc,
	setSongVersion as setVersion,
	songForMix,
	songSlugs,
	updateSong as update,
	updateSongChanges,
	updateSongSections,
	createShareLink,
} from "$lib/server/data";
import {
	IdSchema,
	SongCreateSchema,
	SongDocSaveSchema,
	SongSettingsSchema,
	SongVersionSetSchema,
	StemRenameSchema,
} from "$lib/val/SongSchema";
import { error, invalid, redirect } from "@sveltejs/kit";

/**
 * Song mutations. The account is never taken from the request: each handler
 * looks up the entity's account and checks the caller's membership
 * (src/lib/server/access.ts), then scopes the data call by it.
 */

/** Title, URL, description, songwriter and date; a slug change redirects to the new address. */
export const updateSong = form(
	SongSettingsSchema,
	async (
		{ id, title, slug, description, songwriter, writtenOn, startAt, endAt, frameRate, version },
		issue,
	) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfSong, id);
		const result = await update(accountId, id, {
			title,
			slug,
			description,
			songwriter,
			writtenOn,
			startAt,
			endAt,
			frameRate,
			version,
		});
		if (!result.ok) invalid(issue[result.field](result.error));
		const slugs = await songSlugs(accountId, id);
		if (!slugs) error(404, "Song not found");
		redirect(303, `/${slugs.account}/projects/${slugs.project}/${slugs.song}`);
	},
);

/**
 * Save a song document (chart, lyrics or notes) from the editor. Returns the new
 * version number; a no-op save reports `changed: false`. Blanking a document
 * that has content is refused once (`needsConfirm`) so a second submit with
 * `confirmEmpty` is required.
 */
export const saveDoc = form(
	SongDocSaveSchema,
	async ({ songId, kind, markdown, confirmEmpty }, issue) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfSong, songId);
		const result = await saveSongDoc(accountId, requireUser(locals).id, songId, kind, markdown, {
			confirmEmpty: confirmEmpty === "true",
		});
		if (!result.ok) {
			if (result.needsConfirm) return { needsConfirm: true as const, error: result.error };
			invalid(issue.markdown(result.error));
		}
		return { version: result.version, changed: result.changed };
	},
);

/** New song in a project; lands on its page. */
export const createSong = form(SongCreateSchema, async ({ projectId, title }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfProject, projectId);
	const slugs = await projectSlugs(accountId, projectId);
	if (!slugs) error(404, "Project not found");
	const row = await create(accountId, requireUser(locals).id, projectId, title);
	redirect(303, `/${slugs.account}/projects/${slugs.project}/${row.slug}`);
});

/** Deletes the song, its stems and their blobs; lands on the project. */
export const deleteSong = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const slugs = await songSlugs(accountId, id);
	if (!slugs) error(404, "Song not found");
	await removeSong(accountId, id);
	redirect(303, `/${slugs.account}/projects/${slugs.project}`);
});

/** Deletes one stem and its blob. Used with `.for(stem.id)` in the row menu. */
export const deleteStem = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfStem, id);
	const removed = await removeStem(accountId, id);
	if (!removed) error(404, "Stem not found");
	scheduleMix([removed.songId]);
	return { deleted: true };
});

/** Deletes a demo recording and its blob. Used with `.for(demo.id)` in song settings. */
export const deleteDemo = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfDemo, id);
	if (!(await removeDemo(accountId, id))) error(404, "Demo not found");
	return { deleted: true };
});

/** Sets the song's version, e.g. after the "stems changed — bump?" offer. A command. */
export const setSongVersion = command(SongVersionSetSchema, async ({ id, version }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const row = await setVersion(accountId, id, version);
	if (!row) error(404, "Song not found");
	return row.version;
});

/** Replaces a song's sections (structure timeline). A command: called from the timeline and settings. */
export const saveSections = command(SongSectionsSaveSchema, async ({ id, sections }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const result = await updateSongSections(accountId, id, sections);
	if (!result.ok) error(400, result.error);
	return result.sections;
});

/** Replaces a song's tempo / key / time signature changes. A command, from song settings. */
export const saveChanges = command(SongChangesSaveSchema, async ({ id, changes }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const result = await updateSongChanges(accountId, id, changes);
	if (!result.ok) error(400, result.error);
	return result.changes;
});

/** Removes a stem's MIDI file and its blob. Used with `.for(stem.id)` in the row menu. */
export const removeStemMidi = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfStem, id);
	if (!(await dropMidi(accountId, id))) error(404, "Stem not found");
	return { removed: true };
});

/** Emails a song's link to someone (members only; a few per minute per user). */
const shareWindow = new Map<string, number[]>();
export const shareSong = command(ShareSongSchema, async ({ songId, to, message }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSong, songId);
	const now = Date.now();
	const recent = (shareWindow.get(user.id) ?? []).filter((t) => now - t < 60 * 60 * 1000);
	if (recent.filter((t) => now - t < 60 * 1000).length >= 5 || recent.length >= 30) {
		error(429, "Too many emails; try again in a little while.");
	}
	shareWindow.set(user.id, [...recent, now]);
	const song = await songForMix(songId);
	const slugs = await songSlugs(accountId, songId);
	if (!song || !slugs) error(404, "Song not found");
	const { url } = getRequestEvent();
	// A private song's address alone would be a wall for the recipient: the
	// email carries a viewing link made for them (visible in the share popover).
	const pageUrl = `${url.origin}/${slugs.account}/projects/${slugs.project}/${slugs.song}`;
	const needsLink = song.isPrivate || song.project.isPrivate;
	const link = needsLink
		? await createShareLink(
				accountId,
				user.id,
				{ songId },
				{ note: `emailed to ${to}`, maxUses: null, expiresDays: 0 },
			)
		: null;
	await sendShareEmail({
		to,
		url: link ? `${pageUrl}?share=${link.code}` : pageUrl,
		songTitle: song.title,
		projectName: song.project.name,
		senderName: user.name || user.email,
		senderEmail: user.email,
		message,
	});
	return { sent: to };
});

/** Relabels a stem. A command (not a form): called from the row menu's prompt. */
export const renameStem = command(StemRenameSchema, async ({ id, label }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfStem, id);
	const row = await rename(accountId, id, label);
	if (!row) error(404, "Stem not found");
	return row;
});
