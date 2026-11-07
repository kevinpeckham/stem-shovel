import { command, getRequestEvent } from "$app/server";
import { accountOfFile, accountOfNotation, memberOf, requireUser } from "#lib/server/access.js";
import { readBlob } from "#lib/server/blob.js";
import { renderChartHtml } from "#lib/server/chartHtml.js";
import { aiAvailable, chartCacheKey, readChartOfScore } from "#lib/server/aiDetect.js";
import { background } from "#lib/server/background.js";
import {
	attachFile as moveFile,
	chartReadOfFile,
	createDemoFromFile,
	deleteFile as removeFile,
	getSongById,
	notationForImport,
	saveChartRead,
	updateFile as saveFile,
} from "#lib/server/data.js";
import { HOUR, rateLimited } from "#lib/server/rateLimit.js";
import { redisConfigured, redisPipeline } from "#lib/server/redis.js";
import { chartReadWarnings } from "#lib/utils/chartReadWarnings.js";
import { tidyScoreDiagnostic } from "#lib/utils/tidyScoreDiagnostic.js";
import { ChartReadSaveSchema } from "#lib/val/ChartReadSchema.js";
import { barmarkChartPlays } from "#lib/utils/barmarkChartPlays.js";
import { IdSchema } from "#lib/val/SongSchema.js";
import { scheduleDemoPlayback } from "#lib/server/jobs.js";
import { notifyDemo } from "#lib/server/notifications.js";
import { MAX_DEMOS_PER_SONG } from "#lib/constants/demoFormats.js";
import { MAX_FILES_PER_PROJECT, MAX_FILES_PER_SONG } from "#lib/constants/fileFormats.js";
import {
	SongFileAttachSchema,
	SongFileDeleteSchema,
	SongFileUpdateSchema,
	SongFileUseAsDemoSchema,
} from "#lib/val/SongFileSchema.js";
import { decodeXmlBytes, importMusicXml, readMxl } from "@barmark/musicxml";
import { error } from "@sveltejs/kit";

/** An attachment's title and description, and whether it is a score when `isNotation` is sent (docs/uploads-and-blob.md, "Attachments"); an editor of the account. */
export const updateFile = command(
	SongFileUpdateSchema,
	async ({ id, title, description, isNotation }) => {
		const { locals } = getRequestEvent();
		const { accountId } = await memberOf(locals, accountOfFile, id);
		const row = await saveFile(accountId, id, { title, description, isNotation });
		if (!row) error(404, "File not found");
		return { title: row.title, description: row.description, isNotation: row.isNotation };
	},
);

/**
 * A file moved to a song of its project (`songId`), or back to the project
 * level (`songId` null): the project page's library and the song's
 * Attachments tab share the rows (docs/uploads-and-blob.md, "Attachments").
 * The blob stays put; a file leaving a song stops being a score of it.
 * An editor of the account.
 */
export const attachFile = command(SongFileAttachSchema, async ({ id, songId }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfFile, id);
	const row = await moveFile(accountId, id, songId);
	if (!row) error(404, songId ? "Song not found in this project" : "File not found");
	if (row === "full") {
		error(
			409,
			songId
				? `A song can have at most ${MAX_FILES_PER_SONG} attachments`
				: `A project can have at most ${MAX_FILES_PER_PROJECT} files of its own`,
		);
	}
	return { songId: row.songId, isNotation: row.isNotation };
});

/** The file and its thumbnail gone from the store and the song. */
export const deleteFile = command(SongFileDeleteSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfFile, id);
	if (!(await removeFile(accountId, id))) error(404, "File not found");
	return { deleted: true };
});

/**
 * An audio attachment becomes a demo of its song: the file is copied to the
 * demo's place in the store, the demo is ready at once and its MP3 renders
 * in the jobs function, as after a demo upload. The attachment stays.
 */
export const useAsDemo = command(SongFileUseAsDemoSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfFile, id);
	const userId = requireUser(locals).id;
	const row = await createDemoFromFile(accountId, userId, id);
	if (!row) error(404, "Only a ready audio file can be a demo");
	if (row === "full") error(409, `A song can have at most ${MAX_DEMOS_PER_SONG} demo recordings`);
	scheduleDemoPlayback([row.id]);
	background(() => notifyDemo(accountId, row.id, userId));
	return { demoId: row.id };
});

/** A score file of the account that may go to the AI: a ready notation PDF or image of a song that has not opted out. */
async function scoreFileForAi(accountId: string, id: string) {
	const row = await chartReadOfFile(accountId, id);
	if (!row?.songId) error(404, "Only a score as a PDF or an image has a read");
	const song = await getSongById(accountId, row.songId);
	if (!song) error(404, "Song not found");
	if (song.noAi || song.project.noAi) error(403, "AI is switched off for this song");
	return { ...row, songId: row.songId };
}

/**
 * A score's read as the song-check will take it (docs/audio-engine.md, "The
 * chart read is stored"): the stored read, or the file read by the model
 * now and stored, so a member sees and corrects it before it anchors a
 * check. A fresh read counts against a few per hour; a stored one is free.
 * `warnings` are the signs of a bad read (`chartReadWarnings`). An editor.
 */
export const readChartOfFile = command(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	const { accountId } = await memberOf(locals, accountOfFile, id);
	const row = await scoreFileForAi(accountId, id);
	if (!row.chartRead?.trim()) {
		if (!aiAvailable()) error(503, "The AI read is not configured");
		if (await rateLimited(`chart-read:${user.id}`, 10, HOUR))
			error(429, "Too many chart reads in one hour.");
	}
	let read: { text: string; fromModel: boolean };
	try {
		read = await readChartOfScore(
			{ fileId: row.id, url: row.url, filename: row.filename, chartRead: row.chartRead },
			{ userId: user.id, songId: row.songId, accountId },
		);
	} catch (e) {
		error(502, e instanceof Error ? e.message : "The AI did not read the score");
	}
	return {
		text: read.text,
		edited: !read.fromModel && row.chartReadEdited,
		fromModel: read.fromModel,
		warnings: chartReadWarnings(read.text),
	};
});

/** The largest notation file "Chart from score" reads (a score's MusicXML is rarely a tenth of it). */
const SCORE_IMPORT_MAX_BYTES = 20 * 1024 * 1024;

/**
 * "Chart from score": a song's MusicXML file read by @barmark/musicxml into a
 * barmark chart (chord symbols, keys, meters, sections, repeats), with what
 * it could not carry over, for the draft card to show and save as the song's
 * chart (an editor). No AI and no rate limit: the import takes milliseconds
 * (about 25 ms for 64 bars, warm). A damaged `.mxl` or a file that gives
 * nothing comes back as an empty chart with an error, not as an HTTP error.
 */
export const chartFromScore = command(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfNotation, id);
	const row = await notationForImport(accountId, id);
	if (!row || row.status !== "ready") error(404, "Score not found");
	let res: Response;
	try {
		res = await readBlob(row.url);
	} catch {
		error(502, "The score could not be read");
	}
	if (!res.ok) error(502, "The score could not be read");
	if (Number(res.headers.get("content-length") ?? 0) > SCORE_IMPORT_MAX_BYTES)
		error(413, "The score is too large to chart");
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.byteLength > SCORE_IMPORT_MAX_BYTES) error(413, "The score is too large to chart");
	let xml: string;
	try {
		xml = row.format === "mxl" ? await readMxl(bytes) : decodeXmlBytes(bytes);
	} catch (e) {
		const message = e instanceof Error ? e.message : "The score could not be unpacked";
		return { chart: "", chartHtml: "", diagnostics: [{ level: "error" as const, message }] };
	}
	const { text, diagnostics } = importMusicXml(xml);
	return {
		chart: text,
		chartHtml: text ? renderChartHtml(text) : "",
		diagnostics: diagnostics.map((d) => ({
			level: d.severity === "error" ? ("error" as const) : ("warning" as const),
			message: tidyScoreDiagnostic(d.message),
		})),
	};
});

/** A member's correction of a score's read, kept from then on over any new model read (an editor). */
export const saveChartReadOfFile = command(ChartReadSaveSchema, async ({ id, text }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfFile, id);
	if (!barmarkChartPlays(text))
		error(400, "The read has no bars to play: write each measure between pipes, as | F | C7 |");
	if (!(await chartReadOfFile(accountId, id)))
		error(404, "Only a score as a PDF or an image has a read");
	const row = await saveChartRead(accountId, id, text, true);
	if (!row) error(404, "File not found");
	return { text, edited: true as const, warnings: chartReadWarnings(text) };
});

/** A score's read forgotten, in the row and in Redis, so the next check or read asks the model again (an editor). */
export const clearChartReadOfFile = command(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	const { accountId } = await memberOf(locals, accountOfFile, id);
	const row = await chartReadOfFile(accountId, id);
	if (!row) error(404, "Only a score as a PDF or an image has a read");
	await saveChartRead(accountId, id, null, false);
	if (redisConfigured()) {
		try {
			await redisPipeline([["DEL", chartCacheKey(row.url)]]);
		} catch {
			// the cached read expires on its own
		}
	}
	return { cleared: true as const };
});
