import { command, form, getRequestEvent, query } from "$app/server";
import {
	accountOfProject,
	accountOfRecording,
	accountOfSong,
	memberOf,
	requireUser,
} from "$lib/server/access";
import {
	copyRecordingToSong,
	createSong,
	deleteRecording as removeRecording,
	projectSlugs,
	renameRecording as rename,
	setRecordingNotes,
	songSlugs,
} from "$lib/server/data";
import { MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
import { IdSchema } from "$lib/val/SongSchema";
import {
	RecordingNotesSchema,
	RecordingRenameSchema,
	RecordingToNewSongSchema,
	RecordingToSongSchema,
} from "$lib/val/RecordingSchema";
import { renderMarkdown } from "$lib/server/markdown";
import { error } from "@sveltejs/kit";
import * as v from "valibot";

/** Scratch recordings (docs/demo-recording.md): rename, delete, and add to a song as a demo. */

export const renameRecording = form(RecordingRenameSchema, async ({ id, title }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfRecording, id);
	if (!(await rename(accountId, id, title))) error(404, "Recording not found");
	return { renamed: true };
});

/** The idea's notes, saved whole (the editor autosaves on idle). */
export const saveRecordingNotes = command(RecordingNotesSchema, async ({ id, markdown }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfRecording, id);
	if (!(await setRecordingNotes(accountId, id, markdown))) error(404, "Recording not found");
	return { saved: true };
});

/** The title, from the recorder's title field (a command: it saves on blur or Enter). */
export const setRecordingTitle = command(RecordingRenameSchema, async ({ id, title }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfRecording, id);
	if (!(await rename(accountId, id, title))) error(404, "Recording not found");
	return { title };
});

export const deleteRecording = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfRecording, id);
	if (!(await removeRecording(accountId, id))) error(404, "Recording not found");
	return { deleted: true };
});

/** Copies the recording into the song as a demo; answers with the song's page. */
export const addRecordingToSong = command(RecordingToSongSchema, async ({ id, songId }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfRecording, id);
	const songAccount = await accountOfSong(songId);
	if (songAccount !== accountId) error(404, "Song not found");
	const result = await copyRecordingToSong(accountId, user.id, id, songId);
	if (!result) error(404, "Recording or song not found");
	if (result === "full")
		error(409, `A song can have at most ${MAX_DEMOS_PER_SONG} demo recordings`);
	const slugs = await songSlugs(accountId, songId);
	if (!slugs) error(404, "Song not found");
	return { href: `/${slugs.account}/projects/${slugs.project}/${slugs.song}` };
});

/** A new song in the project with the recording as its first demo; answers with the song's page. */
export const newSongFromRecording = command(
	RecordingToNewSongSchema,
	async ({ id, projectId, title }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const { accountId } = await memberOf(locals, accountOfRecording, id);
		const projectAccount = await accountOfProject(projectId);
		if (projectAccount !== accountId) error(404, "Project not found");
		const slugs = await projectSlugs(accountId, projectId);
		if (!slugs) error(404, "Project not found");
		const song = await createSong(accountId, user.id, projectId, title);
		const result = await copyRecordingToSong(accountId, user.id, id, song.id);
		if (!result || result === "full") error(404, "Recording not found");
		return { href: `/${slugs.account}/projects/${slugs.project}/${song.slug}` };
	},
);

/** The read view of an idea's notes: the same sanitised renderer as the song documents (any signed-in user). */
export const renderNotes = query(v.pipe(v.string(), v.maxLength(50_000)), async (markdown) => {
	requireUser(getRequestEvent().locals);
	return renderMarkdown(markdown);
});
