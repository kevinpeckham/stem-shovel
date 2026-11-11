import { command, form, getRequestEvent, query } from "$app/server";
import { parseChart, printParsed } from "barmark";
import { background } from "#lib/server/background.js";
import { notifySong } from "#lib/server/notifications.js";
import { DraftStoppedError, draftStopNotice } from "#lib/utils/draftStopped.js";
import { chartHash, checkTimingMap } from "@barmark/sync";
import { SongChangesSaveSchema } from "#lib/val/SongChangeSchema.js";
import { ChartlessGridUseSchema } from "#lib/val/ChartlessGridUseSchema.js";
import { ChartColumnsChangeSchema } from "#lib/val/ChartColumnsChangeSchema.js";
import { SongSectionsSaveSchema } from "#lib/val/SongSectionSchema.js";
import { ShareSongSchema } from "#lib/val/ShareSongSchema.js";
import { StemOrderSchema } from "#lib/val/StemOrderSchema.js";
import { sendShareEmail } from "#lib/server/email.js";
import { scheduleMix } from "#lib/server/jobs.js";
import {
	accountOfProject,
	accountOfCredit,
	accountOfDemo,
	accountOfSong,
	accountOfStem,
	memberOf,
	requireUser,
	isEditor,
	songViewerOf,
} from "#lib/server/access.js";
import {
	setSongStage as setStage,
	createSong as create,
	deleteSong as removeSong,
	deleteStem as removeStem,
	deleteDemo as removeDemo,
	projectSlugs,
	removeStemMidi as dropMidi,
	renameStem as rename,
	setStemTint as tintStem,
	reorderStems as reorder,
	saveSongDoc,
	saveUserNote,
	setSongVersion as setVersion,
	mixOwnership,
	scoreForAi,
	sectionVocabulary,
	songForMix,
	chartExamples,
	getSongById,
	setDefaultMix,
	songChordsFor,
	songDetectionsFor,
	setChartTiming,
	setSongStartAndTempo,
	setUseChartTiming,
	setSongChartColumns,
	songNotesFor,
	songSlugs,
	updateSong as update,
	updateSongChanges,
	updateSongSections,
	createShareLink,
	addSongCredit as addCredit,
	removeSongCredit as removeCredit,
} from "#lib/server/data.js";
import {
	IdSchema,
	SongCreateSchema,
	SongDocSaveSchema,
	SongSettingsSchema,
	SongVersionSetSchema,
	StemRenameSchema,
	StemTintSetSchema,
	StemIdsSchema,
	DefaultMixSchema,
} from "#lib/val/SongSchema.js";
import {
	aiAvailable,
	askAiAboutMix,
	detectSectionsWithAi,
	draftChartWithAi,
	reconcileChordsWithAi,
} from "#lib/server/aiDetect.js";
import { renderChartHtml, renderDocHtml } from "#lib/server/chartHtml.js";
import { chartDefaults } from "#lib/utils/chartDefaults.js";
import { barmarkChartBars } from "#lib/utils/barmarkChartBars.js";
import { unescapeChartMarkdown } from "#lib/utils/unescapeChartMarkdown.js";
import { withSongMentions } from "#lib/server/songMentions.js";
import {
	ChartDraftSchema,
	ChartSaveSchema,
	ChartTimingSaveSchema,
	ChartTimingUseSchema,
	ChordsCheckSchema,
} from "#lib/val/ChartDraftSchema.js";
import { buildChartFromDetections, type ChartBuildInput } from "#lib/server/chartBuild.js";
import { checkedConfidence } from "#lib/utils/checkedConfidence.js";
import { sectionBarsOnMap } from "#lib/utils/sectionBarsOnMap.js";
import { trackerBarGrid } from "#lib/utils/trackerBarGrid.js";
import { trackerGridNote } from "#lib/utils/trackerGridNote.js";
import { MY_NOTES_KIND, type SongDocKind } from "#lib/val/SongDocKindSchema.js";
import { SongStageSetSchema } from "#lib/val/SongStageSchema.js";
import { SongCreditAddSchema } from "#lib/val/ArtistSchema.js";
import { HOUR, MINUTE, rateLimited } from "#lib/server/rateLimit.js";
import { barChordsOfSegments } from "#lib/utils/barChordsOfSegments.js";
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
 * `confirmEmpty` is required. The kind "mynotes" is the caller's private note
 * on the song (song_user_note): anyone signed in who may view the song keeps
 * one, editor or not. Every kind answers with its rendered `html`, mentions
 * linked (docs/uploads-and-blob.md, "Mentions"), so the page shows the
 * saved text without a reload.
 */
export const saveDoc = form(
	SongDocSaveSchema,
	async ({ songId, kind, markdown, confirmEmpty }, issue) => {
		const { locals } = getRequestEvent();
		const opts = { confirmEmpty: confirmEmpty === "true" };
		// The editor escapes `|`, `*`, `_`, `[`, `]` and `#` in a chart, which barmark would read literally.
		const text = kind === "chart" ? unescapeChartMarkdown(markdown) : markdown;
		const { accountId, result, html } =
			kind === MY_NOTES_KIND
				? await saveMyNote(locals, songId, text, opts)
				: await saveSharedDoc(locals, songId, kind, text, opts);
		if (!result.ok) {
			if (result.needsConfirm) return { needsConfirm: true as const, error: result.error };
			invalid(issue.markdown(result.error));
		}
		return {
			version: result.version,
			changed: result.changed,
			// The chart is drawn by barmark; mentions link in the other documents' text.
			html: kind === "chart" ? html : await withSongMentions(accountId, songId, html),
		};
	},
);

/** The caller's private note on the song: anyone who may view it keeps one. */
async function saveMyNote(
	locals: App.Locals,
	songId: string,
	markdown: string,
	opts: { confirmEmpty: boolean },
) {
	const { accountId, userId } = await songViewerOf(locals, songId);
	const result = await saveUserNote(songId, userId, accountId, markdown, undefined, opts);
	return { accountId, result, html: result.html ?? "" };
}

/** A shared song document (chart, lyrics or notes): members only. */
async function saveSharedDoc(
	locals: App.Locals,
	songId: string,
	kind: SongDocKind,
	markdown: string,
	opts: { confirmEmpty: boolean },
) {
	const { accountId } = await memberOf(locals, accountOfSong, songId);
	const result = await saveSongDoc(accountId, requireUser(locals).id, songId, kind, markdown, opts);
	return { accountId, result, html: renderDocHtml(kind, markdown) };
}

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

/** Removes a demo from its row's menu in the player's Demos view (Kevin): a command, so the panel can call it. */
export const removeDemoById = command(IdSchema, async ({ id }) => {
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
export const shareSong = command(ShareSongSchema, async ({ songId, mixId, to, message }) => {
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
	// Aimed at a mix (docs/mixes.md): the mix must be this song's; the page opens on it.
	const mix = mixId ? await mixOwnership(mixId) : null;
	if (mixId && mix?.songId !== songId) error(404, "Mix not found");
	const { url } = getRequestEvent();
	// A private song's address alone would be a wall for the recipient: the
	// email carries a viewing link made for them (visible in the share popover).
	const pageUrl = `${url.origin}/${slugs.account}/projects/${slugs.project}/${slugs.song}${mix ? `/mixes/${mix.id}` : ""}`;
	const needsLink = song.isPrivate || song.project.isPrivate;
	const link = needsLink
		? await createShareLink(
				accountId,
				user.id,
				{ songId, mixId: mix?.id },
				{ note: `emailed to ${to}`, maxUses: null, expiresDays: 0 },
			)
		: null;
	await sendShareEmail({
		to,
		url: link ? `${url.origin}/s/${link.code}` : pageUrl,
		mix: mix ? { version: mix.version, label: mix.label } : null,
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

/** A stem's tint in the player (editors); shared with the song, so everyone sees it. */
export const setStemTint = command(StemTintSetSchema, async ({ id, tint }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfStem, id);
	const row = await tintStem(accountId, id, tint);
	if (!row) error(404, "Stem not found");
	return row;
});

/** The rows in a new order, dragged in the player (editors); the order is the song's, for everyone. */
export const reorderStems = command(StemOrderSchema, async ({ songId, ids }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfSong, songId);
	if (!isEditor(m.role)) error(404, "Song not found");
	return { ids: await reorder(m.accountId, songId, ids) };
});

/** Asks the AI Gateway model to read the song's score beside its rendered mix and place its keys, time signature and tempo marks (members; a few per hour). */
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
	// The check needs the score: blind, the model reads its candidates back and guesses tempo from a
	// genre prior (docs/audio-engine.md, "The song-check reads the chart"). 412, not 409: the page
	// waits on a 409 for the mix to render.
	const score = await scoreForAi(accountId, id);
	if (!score)
		error(412, "Write the song's chart or attach its score first; the AI reads it beside the mix");
	const at0 = (kind: string) =>
		song.changes.find((c) => c.kind === kind && c.start === 0)?.value ?? null;
	// The song's own tempo and time signature help the model follow the chart's bars; its key is never handed over.
	return aiOrError(
		askAiAboutMix(
			song.mixUrl,
			{ tempo: at0("tempo"), meter: at0("meter") },
			{ userId: user.id, songId: id, accountId },
			score,
		),
	);
});

/** The bars of a band's chart or a score's chart read, both barmark; undefined when the score has no read yet. */
function barsOfScore(
	score: { kind: "chart"; markdown: string } | { kind: "pdf" | "image"; chartRead: string | null },
	defaults: ReturnType<typeof chartDefaults>,
) {
	if (score.kind === "chart") return barmarkChartBars(score.markdown, defaults);
	return score.chartRead ? barmarkChartBars(score.chartRead, defaults) : undefined;
}

/**
 * The song's chart as the bars it plays, for aligning to the recording in
 * the browser (audio/chartAlignment.ts; stem-bench Study 12), any member.
 * The band's chord chart, else a PDF or image score's stored chart read;
 * never calls the model. A MusicXML score is not read here yet, a score
 * with no read waits for one, and a chart that gives no tempo (with the
 * song's own as the default) or no bars has nothing to render.
 */
export const chartBarsOf = query(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const [song, score] = await Promise.all([songForMix(id), scoreForAi(accountId, id)]);
	if (!song || song.accountId !== accountId) error(404, "Song not found");
	if (!score) return { bars: null, reason: "none" as const };
	if (score.kind === "musicxml") return { bars: null, reason: "musicxml" as const };
	const read = barsOfScore(score, chartDefaults(song.changes));
	if (read === undefined) return { bars: null, reason: "unread" as const };
	if (read === null) return { bars: null, reason: "no-bars" as const };
	// The song's own chart carries its text: an alignment of it is kept as its timing map (`saveChartTiming`).
	return score.kind === "chart"
		? { ...read, source: "chart" as const, text: score.markdown }
		: { ...read, source: "summary" as const };
});

/** Asks the listening model where the song's sections begin, with its score when it has one (members; a few per hour). */
export const detectSections = command(IdSchema, async ({ id }) => {
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
	const [score, vocabulary, full] = await Promise.all([
		scoreForAi(accountId, id),
		sectionVocabulary(accountId, id),
		getSongById(accountId, id),
	]);
	return aiOrError(
		detectSectionsWithAi(
			song.mixUrl,
			{
				tempo: at0("tempo"),
				meter: at0("meter"),
				existing: (full?.sections ?? []).map((s) => ({ name: s.name, start: s.start })),
				vocabulary: vocabulary ?? [],
			},
			{ userId: user.id, songId: id, accountId },
			score ?? null,
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

/** As `aiOrError`, but a draft the model stopped comes back as its `DraftStoppedError`, for the caller to fall back on. */
async function aiOrStopped<T>(work: Promise<T>): Promise<T | DraftStoppedError> {
	try {
		return await work;
	} catch (e) {
		if (e instanceof DraftStoppedError) return e;
		error(502, e instanceof Error ? e.message : "The AI did not answer");
	}
}

/** A song the models have not read: nothing stored beside it. */
const NO_DETECTIONS = { beatsJson: null, mixKey: null, chordsJson: null };

/** The diagnostics with a notice, when there is one, leading them as a warning. */
const withNotice = <D extends { level: "error" | "warning"; message: string }>(
	notice: string | null,
	diagnostics: D[],
) => (notice ? [{ level: "warning" as const, message: notice }, ...diagnostics] : diagnostics);

/**
 * The chart built from the detections, as the draft card's draft: on the
 * beat tracker's bars when they stand and the chord model named the chords
 * (`tracker` is then set, and `gridNote` says when those bars are not the
 * bars the song's settings make), else on the browser's grid. A 422 when
 * there are no bars to chart.
 */
function builtChartDraft(
	song: NonNullable<Awaited<ReturnType<typeof getSongById>>>,
	detections: Awaited<ReturnType<typeof songDetectionsFor>>,
	input: Pick<ChartBuildInput, "grid" | "chords" | "source">,
) {
	const { beatsJson, mixKey, chordsJson } = detections ?? NO_DETECTIONS;
	const read = trackerBarGrid(beatsJson);
	const built = buildChartFromDetections(
		{ title: song.title, changes: song.changes, sections: song.sections, mixKey, chordsJson },
		{ ...input, tracker: read },
	);
	if (!built.chart || !built.timing) error(422, "No bars to chart");
	const timing = built.timing;
	const tracker = built.onTracker ? read : null;
	const sections = sectionBarsOnMap(timing, song.sections);
	const gridNote = tracker ? trackerGridNote(tracker, song.changes, song.startAt) : null;
	const builtDraft = {
		chords: "",
		sections,
		progressions: [],
		chart: built.chart,
		notes: "",
		chartHtml: renderChartHtml(built.chart),
		timing,
		confidence: built.confidence,
		diagnostics: withNotice(gridNote, built.diagnostics),
		source: "built" as const,
		// Where each bar starts in the mix and the last ends: the client places the draft's sections on it.
		barStarts: built.grid,
		onTracker: built.onTracker,
		gridNote,
	};
	return { built, tracker, timing, sections, gridNote, builtDraft };
}

/**
 * A chart drafted from the browser's chord detection (members): built on its
 * bar grid by `chartFromDetections` (src/lib/server/chartBuild.ts), with the
 * timing map that places each bar in the mix; then, with the AI at hand,
 * refined by the model (sections, spellings), the map kept when the refined
 * chart plays the same bars. Without the AI (not configured, or off for the
 * song) the built chart is the draft. A few AI drafts per hour.
 */
export const draftChart = command(ChartDraftSchema, async ({ id, chords, bars, source, grid }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const [song, detections] = await Promise.all([
		getSongById(accountId, id),
		songDetectionsFor(accountId, id),
	]);
	if (!song) error(404, "Song not found");
	const { built, tracker, timing, sections, gridNote, builtDraft } = builtChartDraft(
		song,
		detections,
		{ grid, chords, source },
	);
	if (!aiAvailable() || song.noAi || song.project.noAi) return builtDraft;
	if (await rateLimited(`chart:${user.id}`, 5, HOUR)) error(429, "Too many drafts in one hour.");
	const at0 = (kind: string) =>
		song.changes.find((c) => c.kind === kind && c.start === 0)?.value ?? null;
	const answer = await aiOrStopped(
		draftChartWithAi(
			{
				title: song.title,
				// On the tracker's bars the model reads the starting chart's own tempo line, and the
				// browser's notes per bar sit on another grid, so neither is passed.
				tempo: tracker ? null : at0("tempo"),
				key: at0("key"),
				meter: tracker ? tracker.meter : at0("meter"),
				existingSections: sections,
				bars: tracker ? [] : bars,
				source,
				startingChart: built.chart,
				barCount: timing.chart.bars,
				examples: (await chartExamples(accountId, id)).map((e) => ({
					title: e.title,
					sections: e.sections.map((s) => ({ name: s.name })),
					chart: e.chart,
				})),
			},
			{ userId: user.id, songId: id },
		),
	);
	// A draft the model stopped (the gateway's safety filter, the output budget): the built
	// chart stands in, with the reason, so the card shows a chart and says why (Study 38).
	if (answer instanceof DraftStoppedError)
		return {
			...builtDraft,
			stopped: { reason: answer.reason },
			diagnostics: [
				{ level: "warning" as const, message: draftStopNotice(answer.reason) },
				...builtDraft.diagnostics,
			],
		};
	// The map fits the refined chart only if it plays the same bars; it is re-hashed to it.
	const parse = parseChart(answer.chart);
	const kept =
		parse.bars.length === timing.chart.bars &&
		!parse.diagnostics.some((d) => d.severity === "error");
	// The chart is previewed with the panel's styling before it is saved.
	return {
		...answer,
		chartHtml: renderChartHtml(answer.chart),
		timing: kept
			? { ...timing, chart: { ...timing.chart, hash: chartHash(answer.chart, parse) } }
			: null,
		confidence: kept ? built.confidence : null,
		barStarts: builtDraft.barStarts,
		onTracker: builtDraft.onTracker,
		gridNote,
		diagnostics: kept
			? builtDraft.diagnostics
			: [
					...builtDraft.diagnostics,
					{
						level: "warning" as const,
						message: `The AI changed the bar count (${parse.bars.length} for ${timing.chart.bars}); the timing map was dropped.`,
					},
				],
		source: "ai" as const,
	};
});

/**
 * The detected chords checked against the transcribed notes by the draft
 * model (stem-bench Study 13), one chord per bar back, or null with the
 * reason when the answer did not parse (the page keeps the detector's
 * chords). Members; a few per hour; a 502 only when the gateway fails.
 */
export const reconcileChords = command(ChordsCheckSchema, async ({ id, chords, bars }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSong, id);
	if (!aiAvailable()) error(503, "The AI check is not configured");
	const song = await getSongById(accountId, id);
	if (!song) error(404, "Song not found");
	if (song.noAi || song.project.noAi) error(403, "AI is switched off for this song");
	if (await rateLimited(`reconcile:${user.id}`, 10, HOUR))
		error(429, "Too many chord checks in one hour.");
	const at0 = (kind: string) =>
		song.changes.find((c) => c.kind === kind && c.start === 0)?.value ?? null;
	return aiOrError(
		reconcileChordsWithAi(
			{
				key: at0("key"),
				meter: at0("meter"),
				tempo: at0("tempo"),
				chords: barChordsOfSegments(chords, bars.length),
				bars,
			},
			{ userId: user.id, songId: id },
		),
	);
});

/**
 * A drafted chart in barmark's canonical form (spelling and layout only,
 * spec section 8) when it parses without errors; with an error it is kept as
 * written, and the editor shows the diagnostics.
 */
function canonicalDraft(markdown: string): string {
	const parse = parseChart(markdown);
	return parse.diagnostics.some((d) => d.severity === "error")
		? markdown
		: printParsed(markdown, parse);
}

/**
 * Saves a drafted chart as the song's chart, canonical where it parses;
 * refuses to overwrite content unless `replace`. The draft's timing map is
 * kept beside it when it checks clean against the stored text, and its
 * confidence when that fits the map. `source` (a score file or the stems)
 * becomes the chart's source line.
 */
export const saveChartDraft = command(
	ChartSaveSchema,
	async ({ id, markdown, replace, timing, confidence, source }) => {
		const { locals } = getRequestEvent();
		const user = requireUser(locals);
		const { accountId } = await memberOf(locals, accountOfSong, id);
		const song = await getSongById(accountId, id);
		if (!song) error(404, "Song not found");
		if (song.chartMarkdown.trim() && !replace) error(409, "The song already has a chart");
		const stored = canonicalDraft(markdown);
		const result = await saveSongDoc(accountId, user.id, id, "chart", stored, { source });
		if (!result.ok) error(400, result.error);
		if (timing !== undefined) {
			const { map } = checkTimingMap(timing, { text: stored.replace(/\r\n/g, "\n") });
			if (map) await setChartTiming(accountId, id, map, checkedConfidence(confidence, map));
		}
		return { version: result.version };
	},
);

/**
 * Keeps a timing map for the song's own chart, from the chart aligned to the
 * stems in the browser (`source: "aligned"`), when it checks clean against
 * the stored chart; its confidence is cleared (members).
 */
export const saveChartTiming = command(ChartTimingSaveSchema, async ({ id, timing }) => {
	const { locals } = getRequestEvent();
	requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const song = await getSongById(accountId, id);
	if (!song) error(404, "Song not found");
	const { map } = checkTimingMap(timing, { text: song.chartMarkdown });
	if (!map) error(400, "The timing map does not fit the chart");
	await setChartTiming(accountId, id, map, null);
	return { saved: true };
});

/**
 * Whether the player's bar grid follows the song's chart timing map instead
 * of the declared tempo (`song.useChartTiming`; members).
 */
export const setChartTimingUse = command(ChartTimingUseSchema, async ({ id, use }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	if (!(await setUseChartTiming(accountId, id, use))) error(404, "Song not found");
	return { use };
});

/**
 * How the song's chart sizes its columns: `row` lets each row size its own
 * bars, `shared` (the default) lines bar lines up down a section
 * (`song.chartColumns`; members).
 */
export const setChartColumns = command(ChartColumnsChangeSchema, async ({ id, columns }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	if (!(await setSongChartColumns(accountId, id, columns))) error(404, "Song not found");
	return { columns };
});

/**
 * The chartless placement made the song's grid ("Use as start of bar 1" on
 * the detected chords card): its start of bar 1 and its first tempo (members).
 */
export const useChartlessGrid = command(ChartlessGridUseSchema, async ({ id, startAt, bpm }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	if (!(await setSongStartAndTempo(accountId, id, startAt, bpm))) error(404, "Song not found");
	return { startAt, bpm };
});

/** Forgets the song's chart timing map and its confidence, and the player stops following it (members). */
export const clearChartTiming = command(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	await setChartTiming(accountId, id, null, null);
	return { cleared: true };
});

/** The notes the server transcribed for the chart draft (members), and whether they are complete. */
/**
 * The song's chords as the chord model read them from its current mix
 * (src/lib/server/chords.ts), any member: `chords` null when they are not
 * read yet (then `inFlight` says a run is under way, `hasMix` whether there
 * is a mix to read at all).
 */
export const songChords = query(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const found = await songChordsFor(accountId, id);
	if (!found) error(404, "Song not found");
	return found;
});

export const songNotes = query(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfSong, id);
	const found = await songNotesFor(accountId, id);
	if (!found) error(404, "Song not found");
	return found;
});

/** The song's stage (docs/mixes.md, "Phase 2"), any member; "" reads it from the song again. Finished follows it. */
export const setSongStage = form(SongStageSetSchema, async ({ id, stage }) => {
	const { locals } = getRequestEvent();
	const m = await memberOf(locals, accountOfSong, id);
	if (!(await setStage(m.accountId, id, stage || null))) error(404, "Song not found");
	return { stage: stage || null };
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
