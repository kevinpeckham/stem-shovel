import { command, form, getRequestEvent, query } from "$app/server";
import { background } from "$lib/server/background";
import { notifySong } from "$lib/server/notifications";
import { barAt, barGrid } from "$lib/audio/measures";
import { SongChangesSaveSchema } from "$lib/val/SongChangeSchema";
import { SongSectionsSaveSchema } from "$lib/val/SongSectionSchema";
import { ShareSongSchema } from "$lib/val/ShareSongSchema";
import { sendShareEmail } from "$lib/server/email";
import { scheduleMix } from "$lib/server/jobs";
import {
	accountOfProject,
	accountOfCredit,
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
	chartExamples,
	getSongById,
	setDefaultMix,
	setSongFinished as setSongFinished_,
	songNotesFor,
	songSlugs,
	updateSong as update,
	updateSongChanges,
	updateSongSections,
	createShareLink,
	addSongCredit as addCredit,
	removeSongCredit as removeCredit,
} from "$lib/server/data";
import {
	IdSchema,
	SongCreateSchema,
	SongDocSaveSchema,
	SongSettingsSchema,
	SongVersionSetSchema,
	StemRenameSchema,
	StemIdsSchema,
	DefaultMixSchema,
} from "$lib/val/SongSchema";
import { aiAvailable, askAiAboutMix, draftChartWithAi } from "$lib/server/aiDetect";
import { renderMarkdown } from "$lib/server/markdown";
import { ChartDraftSchema, ChartSaveSchema } from "$lib/val/ChartDraftSchema";
import { SongFinishedSchema } from "$lib/val/SongFinishedSchema";
import { SongCreditAddSchema } from "$lib/val/ArtistSchema";
import { HOUR, MINUTE, rateLimited } from "$lib/server/rateLimit";
import { error, invalid, redirect } from "@sveltejs/kit";

/**
 * Song mutations. The account is never taken from the request: each handler
 * looks up the entity's account and checks the caller's membership
 * (src/lib/server/access.ts), then scopes the data call by it.
 */

/** Title, URL, description and date; a slug change redirects to the new address. */
export const updateSong = form(
	SongSettingsSchema,
	async (
		{ id, title, slug, description, writtenOn, startAt, endAt, frameRate, version },
		issue,
	) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfSong, id);
		const result = await update(accountId, id, {
			title,
			slug,
			description,
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
	const creator = requireUser(locals).id;
	const row = await create(accountId, creator, projectId, title);
	background(() => notifySong(accountId, row.id, creator));
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
/** The stems a "Replace Stems" batch drops (members): each checked against the caller's accounts, the mix rendered once. */
export const removeStems = command(StemIdsSchema, async ({ ids }) => {
	const { locals } = getRequestEvent();
	const songIds = new Set<string>();
	for (const id of ids) {
		const { accountId } = await memberOf(locals, accountOfStem, id);
		const removed = await removeStem(accountId, id);
		if (removed) songIds.add(removed.songId);
	}
	scheduleMix([...songIds]);
	return { removed: ids.length };
});

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
export const shareSong = command(ShareSongSchema, async ({ songId, to, message }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSong, songId);
	if (
		(await rateLimited(`share:${user.id}:m`, 5, MINUTE)) ||
		(await rateLimited(`share:${user.id}:h`, 30, HOUR))
	) {
		error(429, "Too many emails; try again in a little while.");
	}
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

/** Asks the AI Gateway model to check the song's tempo, key and meter against its rendered mix (members; a few per hour). */
export const askAiAboutSong = command(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSong, id);
	if (!aiAvailable()) error(503, "The AI check is not configured");
	const song = await songForMix(id);
	if (!song || song.accountId !== accountId) error(404, "Song not found");
	if (song.noAi || song.project.noAi) error(403, "AI is switched off for this song");
	if (await rateLimited(`ai:${user.id}`, 10, HOUR)) error(429, "Too many AI checks in one hour.");
	if (!song.mixUrl) error(409, "The mix has not been rendered yet; try again in a moment.");
	const at0 = (kind: string) =>
		song.changes.find((c) => c.kind === kind && c.start === 0)?.value ?? null;
	return aiOrError(
		askAiAboutMix(
			song.mixUrl,
			{ tempo: at0("tempo"), key: at0("key"), meter: at0("meter") },
			{ userId: user.id, songId: id },
		),
	);
});

/**
 * An AI failure (gateway down, model answered nonsense) as a 502 carrying its message;
 * thrown as a plain Error the client would only see "Internal Error" in production.
 */
async function aiOrError<T>(work: Promise<T>): Promise<T> {
	try {
		return await work;
	} catch (e) {
		error(502, e instanceof Error ? e.message : "The AI did not answer");
	}
}

/** Names sections, progressions and a chart from the browser's chord detection (members; a few per hour). */
export const draftChart = command(ChartDraftSchema, async ({ id, chords, bars }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSong, id);
	if (!aiAvailable()) error(503, "The AI draft is not configured");
	const song = await getSongById(accountId, id);
	if (!song) error(404, "Song not found");
	if (song.noAi || song.project.noAi) error(403, "AI is switched off for this song");
	if (await rateLimited(`chart:${user.id}`, 5, HOUR)) error(429, "Too many drafts in one hour.");
	const at0 = (kind: string) =>
		song.changes.find((c) => c.kind === kind && c.start === 0)?.value ?? null;
	const grid = barGrid(song.changes, song.startAt);
	const existingSections = grid
		? song.sections.map((s) => ({ index: s.index, name: s.name, bar: barAt(grid, s.start).bar }))
		: [];
	const answer = await aiOrError(
		draftChartWithAi(
			{
				title: song.title,
				tempo: at0("tempo"),
				key: at0("key"),
				meter: at0("meter"),
				existingSections,
				chords,
				bars,
				examples: (await chartExamples(accountId, id)).map((e) => ({
					title: e.title,
					sections: e.sections.map((s) => ({ index: s.index, name: s.name })),
					chart: e.chart,
				})),
			},
			{ userId: user.id, songId: id },
		),
	);
	// The chart is previewed with the panel's styling before it is saved.
	return { ...answer, chartHtml: renderMarkdown(answer.chart) };
});

/** Saves a drafted chart as the song's chart; refuses to overwrite content unless `replace`. */
export const saveChartDraft = command(ChartSaveSchema, async ({ id, markdown, replace }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const song = await getSongById(accountId, id);
	if (!song) error(404, "Song not found");
	if (song.chartMarkdown.trim() && !replace) error(409, "The song already has a chart");
	const result = await saveSongDoc(accountId, user.id, id, "chart", markdown);
	if (!result.ok) error(400, result.error);
	return { version: result.version };
});

/** The notes the server transcribed for the chart draft (members), and whether they are complete. */
export const songNotes = query(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const found = await songNotesFor(accountId, id);
	if (!found) error(404, "Song not found");
	return found;
});

/** Finished or back in progress (any member); the project page files finished songs apart. */
export const setSongFinished = form(SongFinishedSchema, async ({ id, finished }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfSong, id);
	if (!(await setSongFinished_(m.accountId, id, finished === "true"))) error(404, "Song not found");
	return { finished: finished === "true" };
});

/** Saves the faders as the song's default mix for every listener (members); the original mixdown re-renders. */
export const saveDefaultMix = command(DefaultMixSchema, async ({ id, gains }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	if (!(await setDefaultMix(accountId, id, gains))) error(404, "Song not found");
	scheduleMix([id]);
	return { saved: gains.length };
});

/** Credits an artist on a song (the account's directory by name, or a new artist) in a role. */
export const addSongCredit = command(SongCreditAddSchema, async ({ songId, role, name }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, songId);
	const who = await addCredit(accountId, songId, role, name);
	if (!who) error(404, "Song not found");
	return { artistId: who.id, name: who.name };
});

/** Takes a credit off a song; the artist stays in the account's directory. */
export const removeSongCredit = command(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfCredit, id);
	if (!(await removeCredit(accountId, id))) error(404, "Credit not found");
	return { removed: true };
});
