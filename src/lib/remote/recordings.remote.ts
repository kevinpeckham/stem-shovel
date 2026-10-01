import { command, getRequestEvent } from "$app/server";
import {
	accountOfProject,
	accountOfRecording,
	accountOfSong,
	requireEditor,
	requireUser,
} from "$lib/server/access";
import {
	copyRecordingToSong,
	createSong,
	deleteIdeaIfEmpty,
	mergeIdeaNotesIntoSong,
	deleteRecording as removeRecording,
	projectSlugs,
	renameRecording as rename,
	songSlugs,
	userOwnsRecording,
} from "$lib/server/data";
import { MAX_DEMOS_PER_SONG } from "$lib/constants/demoFormats";
import { IdSchema } from "$lib/val/SongSchema";
import { RecordingToNewSongSchema, RecordingToSongSchema } from "$lib/val/RecordingSchema";
import { TakeNameSchema } from "$lib/val/IdeaSchema";
import { error } from "@sveltejs/kit";

/** Takes of an idea (docs/demo-recording.md): name, delete, and add to a song as a demo. Each is the caller's own. */

/** The caller's own take (its idea is theirs), else 404: ideas are the user's own, whichever account holds their files. */
async function ownTake(id: string) {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const accountId = await accountOfRecording(id);
	if (!accountId || !(await userOwnsRecording(accountId, user.id, id)))
		error(404, "Recording not found");
	return { accountId, user, locals };
}

/** A take's own name (may be empty: it then shows as "Take N"). */
export const setTakeName = command(TakeNameSchema, async ({ id, title }) => {
	const { accountId } = await ownTake(id);
	if (!(await rename(accountId, id, title))) error(404, "Recording not found");
	return { title };
});

/** Delete a take from the recorder's menu. */
/** Removes the take; the idea too when that leaves it with neither takes nor notes. */
export const deleteTake = command(IdSchema, async ({ id }) => {
	const { accountId } = await ownTake(id);
	const gone = await removeRecording(accountId, id);
	if (!gone) error(404, "Recording not found");
	const ideaDeleted = gone.ideaId ? await deleteIdeaIfEmpty(accountId, gone.ideaId) : false;
	return { deleted: true, ideaDeleted };
});

/** Copies the recording into the song as a demo (a song in any account the user edits); answers with the song's page. */
export const addRecordingToSong = command(
	RecordingToSongSchema,
	async ({ id, songId, mergeNotes }) => {
		const { accountId, user, locals } = await ownTake(id);
		const songAccount = await accountOfSong(songId);
		if (!songAccount) error(404, "Song not found");
		requireEditor(locals, songAccount);
		const result = await copyRecordingToSong(accountId, user.id, id, songId);
		if (!result) error(404, "Recording or song not found");
		if (result === "full")
			error(409, `A song can have at most ${MAX_DEMOS_PER_SONG} demo recordings`);
		if (mergeNotes) await mergeIdeaNotesIntoSong(accountId, user.id, songId, id);
		const slugs = await songSlugs(songAccount, songId);
		if (!slugs) error(404, "Song not found");
		return { href: `/${slugs.account}/projects/${slugs.project}/${slugs.song}` };
	},
);

/** A new song in the project with the recording as its first demo; answers with the song's page. */
export const newSongFromRecording = command(
	RecordingToNewSongSchema,
	async ({ id, projectId, title, mergeNotes }) => {
		const { accountId, user, locals } = await ownTake(id);
		const projectAccount = await accountOfProject(projectId);
		if (!projectAccount) error(404, "Project not found");
		requireEditor(locals, projectAccount);
		const slugs = await projectSlugs(projectAccount, projectId);
		if (!slugs) error(404, "Project not found");
		const song = await createSong(projectAccount, user.id, projectId, title);
		const result = await copyRecordingToSong(accountId, user.id, id, song.id);
		if (!result || result === "full") error(404, "Recording not found");
		if (mergeNotes) await mergeIdeaNotesIntoSong(accountId, user.id, song.id, id);
		return { href: `/${slugs.account}/projects/${slugs.project}/${song.slug}` };
	},
);
