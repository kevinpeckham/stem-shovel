import { readBlob } from "#lib/server/blob.js";
import { logAiRequest, saveChartRead } from "#lib/server/data.js";
import { createGateway } from "@ai-sdk/gateway";
import { chartStatedAnswer } from "#lib/utils/chartStatedAnswer.js";
import { chartReadWarnings } from "#lib/utils/chartReadWarnings.js";
import { barmarkChartPlays } from "#lib/utils/barmarkChartPlays.js";
import { repairChordSpellings } from "#lib/utils/repairChordSpellings.js";
import { repairLeadingHolds } from "#lib/utils/repairLeadingHolds.js";
import { parseChart } from "barmark";
import { settingsChartDisagreement } from "#lib/utils/settingsChartDisagreement.js";
import { generateText } from "ai";
import {
	type BarNotesInput,
	type ChartDraftAnswer,
	ChartDraftAnswerSchema,
} from "#lib/val/ChartDraftSchema.js";
import * as v from "valibot";
import { ENV } from "varlock/env";
import { FILE_CONTENT_TYPE_OF } from "#lib/constants/fileFormats.js";
import { redisConfigured, redisPipeline } from "#lib/server/redis.js";
import { createHash } from "node:crypto";
import { musicXmlFromMxl } from "#lib/utils/musicXmlFromMxl.js";
import { musicXmlSummary } from "#lib/utils/musicXmlSummary.js";
import { parseReconciledChords } from "#lib/utils/parseReconciledChords.js";
import { reconcileChordsMessage } from "#lib/utils/reconcileChordsMessage.js";

/**
 * The song-check: a model reads the song's chart beside its rendered mix
 * and places the chart's keys, time signature and tempo marks in the
 * recording (`@ai-sdk/gateway` + `ai`). It needs the chart: blind, the
 * model reads the candidates it is handed back and pins tempo to a genre
 * prior (stem-bench Study 4, FINDINGS.md "AI features"), so the DSP
 * detector keeps tempo and meter wherever the chart does not state them
 * (utils/chartStatedAnswer.ts). Off entirely without AI_GATEWAY_API_KEY.
 */
const MODEL = "google/gemini-3-flash";
/** The chart draft reads transcribed notes, no listening needed: a frontier text model reads them best (docs/audio-engine.md). */
const DRAFT_MODEL = "anthropic/claude-fable-5-1";
/** Gemini takes inline audio up to about 20 MB; the mixes are MP3s of a few MB. */
const MAX_AUDIO_BYTES = 18 * 1024 * 1024;
/** The mix and a score PDF or image go in one request, under Gemini's inline limit together. */
const MAX_REQUEST_BYTES = 19 * 1024 * 1024;

export const aiAvailable = () => !!ENV.AI_GATEWAY_API_KEY;

/**
 * The chart the model reads beside the mix (docs/audio-engine.md, "The
 * score as the AI's chart"): a MusicXML file as the text summary of its
 * keys and chords, a PDF or image of the score as the file itself, or
 * the song's own chord chart document as its markdown ("The chord chart
 * as the AI's chart"). A PDF or image carries its stored read (`chartRead`,
 * "The chart read is stored") and the row it is stored on.
 */
export type ScoreForAi =
	| { kind: "musicxml"; format: "mxl" | "musicxml"; url: string; filename: string; title: string }
	| ScoreFileForAi
	| { kind: "chart"; markdown: string; title: string };
/** A score as a PDF or image (`song_file` with `isNotation`): the file, and its read when one is stored. */
export interface ScoreFileForAi {
	kind: "pdf" | "image";
	fileId: string;
	url: string;
	filename: string;
	title: string;
	sizeBytes: number;
	chartRead: string | null;
	chartReadEdited: boolean;
}
/** Who asks: the log's user and song, and the account a fresh read is stored in. */
interface AiAsker {
	userId: string;
	songId: string;
	accountId: string;
}
/**
 * What the request carries for the chart: its text, the PDF or image
 * itself, or both. `chord` when the text is the band's own chord chart;
 * `barmark` when it is a score's read as a barmark chart (`readChartWithAi`),
 * else a score's text is the `m<n>` measure summary (`musicXmlSummary`, and
 * a read stored before the reads were barmark).
 */
interface ScorePart {
	text?: string;
	file?: { data: Uint8Array; mediaType: string; filename: string };
	chord?: boolean;
	barmark?: boolean;
}
/** The band's chart is free text; this much of it goes along (the draft examples send 3 000). */
const CHORD_CHART_MAX_CHARS = 12_000;
/** What a score is called in the log: its file, or the song's chart document. */
const scoreName = (score: ScoreForAi | null | undefined) =>
	score ? (score.kind === "chart" ? `chart of ${score.title}` : score.filename) : "";

/**
 * Reads the score from Blob into what the request carries: a MusicXML as
 * its summary; a PDF or image as its stored read when it has one, else the
 * barmark chart a reading model makes of it (`readChartWithAi`, then stored
 * on the file), plus the file itself when it fits beside the mix. Null when
 * nothing could be read.
 */
async function loadScore(
	score: ScoreForAi,
	audioBytes: number,
	who: AiAsker,
): Promise<ScorePart | null> {
	if (score.kind === "chart") {
		const text = score.markdown.trim().slice(0, CHORD_CHART_MAX_CHARS);
		return text ? { text, chord: true } : null;
	}
	const stored = score.kind === "musicxml" ? "" : storedRead(score);
	const res = await readBlob(score.url);
	if (!res.ok) return stored ? readPart(stored) : null;
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (score.kind === "musicxml") {
		const xml = score.format === "mxl" ? musicXmlFromMxl(bytes) : new TextDecoder().decode(bytes);
		const summary = xml ? musicXmlSummary(xml) : "";
		return summary ? { text: summary } : null;
	}
	const mediaType = FILE_CONTENT_TYPE_OF(score.filename);
	const text =
		stored ||
		(await readChartWithAi(score, bytes, mediaType, who)
			.then(async (read) => {
				// Stored for the member to see and correct; the check goes on without it.
				await saveChartRead(who.accountId, score.fileId, read, false).catch(() => null);
				return read;
			})
			.catch(() => ""));
	const file =
		audioBytes + bytes.byteLength <= MAX_REQUEST_BYTES
			? { data: bytes, mediaType, filename: score.filename }
			: undefined;
	return text || file ? { text: text || undefined, barmark: barmarkChartPlays(text), file } : null;
}

/** A score's read as the request's text, flagged when it is barmark (a read stored before may be the old summary). */
const readPart = (text: string): ScorePart => ({ text, barmark: barmarkChartPlays(text) });

/** The read stored on a score file, when there is one. */
const storedRead = (score: Pick<ScoreFileForAi, "chartRead">) => score.chartRead?.trim() ?? "";

/** A read with its known slips repaired: holds before any chord as N.C., stacked chord spellings as barmark reads them. */
const repairRead = (text: string) => repairChordSpellings(repairLeadingHolds(text));

/**
 * A score's read for a member to see before any check (docs/audio-engine.md,
 * "The chart read is stored"): the stored read when there is one
 * (`fromModel` false), else the file read by the model now and stored on
 * it. Throws when the file or the model fails.
 */
export async function readChartOfScore(
	score: Pick<ScoreFileForAi, "fileId" | "url" | "filename" | "chartRead">,
	who: AiAsker,
): Promise<{ text: string; fromModel: boolean }> {
	// A read's known slips (holds before any chord, stacked chord spellings) are repaired on the way out, stored reads too.
	const stored = repairRead(storedRead(score));
	if (stored) return { text: stored, fromModel: false };
	const res = await readBlob(score.url);
	if (!res.ok) throw new Error("The score could not be fetched");
	const bytes = new Uint8Array(await res.arrayBuffer());
	const text = repairRead(
		await readChartWithAi(score, bytes, FILE_CONTENT_TYPE_OF(score.filename), who),
	);
	await saveChartRead(who.accountId, score.fileId, text, false);
	return { text, fromModel: true };
}

/** Where Redis keeps a file's read, by its URL (a second-level cache under the stored read); `chart2:` since the reads are barmark, so no summary cached before is served. */
export const chartCacheKey = (url: string) =>
	`chart2:${createHash("sha256").update(url).digest("hex").slice(0, 32)}`;

/**
 * What `readChartWithAi` asks for: the score as a barmark chart (barmark
 * grammar v0.1: directive lines, one cell per measure, repeats, endings,
 * directions, rehearsal marks and headings), so its bars' written numbers
 * are the score's measure numbers.
 */
const CHART_READ_SYSTEM = `You read music notation. The attached file is a song's chart or score. Write it out as a chart in barmark, a plain-text chord chart notation, in exactly this form and nothing else:

# <title>
part: <the part you read, e.g. "Electric Guitar 1 (3 parts)">
key: <key>, time: <time signature>, tempo: <bpm>
<the bars, one bar line per system of the score>

Rules:
- The "part:" line names the part you read (barmark 0.13.0: a directive, once, before the first bar). The directives line: "key:" from the key signature, as barmark spells a key: the tonic with b or # for a flat or sharp, and m for minor ("F", "Bb", "Eb", "F#", "Dm", "C#m"). Prefer the major key for a signature unless the chords plainly sit in the relative minor; a text such as "Key: F Major" in the score confirms it. "time:" the time signature ("4/4", "3/4", "6/8"); "tempo:" the beats per minute of a metronome mark. State only what the score shows: leave out any of the three it does not show.
- Every measure of the score is written once, in order, as one cell between pipes: | F | C7 | Bbmaj7/F | Gm7 C7 |. Count every measure in every system on every page (the small numbers at the start of a system are measure numbers: use them to keep count), so the bars' numbers match the score's measure numbers.
- In a cell, the measure's chord symbols in the order they occur, separated by spaces, as written (Fmaj9, Bbmaj7/F, Cm7), with b and # for flats and sharps. Alterations a score stacks (add9, omit5, no3, sus4, b5, #9) go in one parenthesis after the quality, separated by commas: D6(add9,omit5), G(omit5), F#(b5,omit3), C7(#9,b13); never run together and never bare after the root. A measure with no chord symbol keeps the harmony before it: write / alone in its cell; but before any chord symbol has been written (a melody-only opening), there is nothing to hold, so write N.C. in each such cell. A measure with the repeat-measure sign is %. N.C. where the score says N.C.
- Repeats: a bar line that begins a repeat starts with |: (start a new line at that measure), and the line where the repeat ends closes with :| . Endings are bar lines of their own after the repeated bars: |1 G | G7 :| for a first ending (it closes with :|), |2 G | C | for a second, |1-3 ... :| for one ending on several passes.
- Directions are cells of their own between bars, where the score prints them: Segno, Coda, To Coda, Fine, D.C., D.C. al Fine, D.C. al Coda, D.S., D.S. al Fine, D.S. al Coda. For example: | Segno | C | F | To Coda | G | C | D.S. al Coda |
- A rehearsal letter or number is a cell of its own just before its measure, letters and digits after @: | @A | F | C |.
- A section name printed in the score (Intro, Verse, Chorus, Bridge, Solo, Outro) is a heading line above its bars, ## Verse, and its first measure starts a new line. A repeat opens and closes within one section: write no heading between a |: and its :|.
- Other text printed on a measure (rit., solo, a cue) goes in double quotes in that measure's cell, before its chords: | "rit." F C |. Lyrics are not text: leave them out.
- A key, time or tempo change is a directive line of its own just before the bar line that starts with the measure it applies to (start a new line there): key: Ab or time: 3/4 or tempo: 96.
- Do not invent anything the score does not show. If a page is unreadable, say so on a final line beginning "Note:".`;

/** A read chart stays cached this long; the file never changes under its URL (Blob pathnames are never reused). */
const CHART_CACHE_SECONDS = 30 * 24 * 3600;

/**
 * A PDF or image of a chart as a barmark chart (docs/audio-engine.md, "The
 * score as the AI's chart"; the band's own charts are barmark too): a text
 * model that reads documents (DRAFT_MODEL) writes the key, time and tempo
 * as directive lines where they are set or change, every measure once as a
 * cell (so the bars' written numbers are the score's measure numbers),
 * repeats, endings, directions, rehearsal marks, section headings and
 * words. The answer passes when barmark plays at least one bar of it.
 * Gemini listening to the mix did not read key signatures off a six-page
 * engraved score (Kevin's test); read as text, the keys are plain. Cached
 * in Redis by the file's URL for a month; logged as `chart-read`.
 */
export async function readChartWithAi(
	score: { url: string; filename: string },
	bytes: Uint8Array,
	mediaType: string,
	who: { userId: string; songId: string },
): Promise<string> {
	if (!ENV.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not configured");
	const cacheKey = chartCacheKey(score.url);
	if (redisConfigured()) {
		try {
			const [hit] = await redisPipeline([["GET", cacheKey]]);
			if (typeof hit === "string" && hit) return hit;
		} catch {
			// the cache is a convenience: read the chart again
		}
	}
	const gateway = createGateway({ apiKey: ENV.AI_GATEWAY_API_KEY });
	const system = CHART_READ_SYSTEM;
	const started = Date.now();
	const log = {
		kind: "chart-read",
		model: DRAFT_MODEL,
		userId: who.userId,
		songId: who.songId,
		prompt: `SYSTEM:\n${system}\n\nUSER (with ${score.filename}, ${bytes.byteLength} bytes)`,
	};
	let text = "";
	let usage: { inputTokens?: number; outputTokens?: number } = {};
	try {
		const result = await generateText({
			model: gateway(DRAFT_MODEL),
			system,
			messages: [
				{
					role: "user",
					content: [
						mediaType.startsWith("image/")
							? { type: "image" as const, image: bytes, mediaType }
							: { type: "file" as const, data: bytes, mediaType, filename: score.filename },
						{ type: "text", text: "Write this chart out as instructed." },
					],
				},
			],
			providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } },
		});
		text = result.text.trim();
		usage = { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens };
	} catch (e) {
		await logAiRequest({
			...log,
			error: e instanceof Error ? e.message : String(e),
			durationMs: Date.now() - started,
		});
		throw e;
	}
	const parse = parseChart(text);
	const error = parse.bars.length > 0 ? null : "The model did not write the chart out";
	await logAiRequest({
		...log,
		response: text,
		parsed: error
			? null
			: {
					bars: parse.bars.length,
					errors: parse.diagnostics.filter((d) => d.severity === "error").length,
				},
		error,
		durationMs: Date.now() - started,
		inputTokens: usage.inputTokens ?? null,
		outputTokens: usage.outputTokens ?? null,
	});
	if (error) throw new Error(error);
	if (redisConfigured()) {
		try {
			await redisPipeline([["SET", cacheKey, text, "EX", CHART_CACHE_SECONDS]]);
		} catch {
			// cached next time, or not
		}
	}
	return text;
}

const Bpm = v.pipe(v.number(), v.minValue(20), v.maxValue(400));
const Key = v.pipe(v.string(), v.trim(), v.maxLength(20));
const AnswerSchema = v.object({
	/** null = no fixed tempo (rubato, free time). */
	tempo: v.nullable(Bpm),
	/** Discrete tempo shifts after the start, in order; empty when the tempo holds. */
	tempoChanges: v.optional(
		v.pipe(v.array(v.object({ at: v.pipe(v.number(), v.minValue(0)), bpm: Bpm })), v.maxLength(12)),
		[],
	),
	meter: v.union([v.pipe(v.string(), v.regex(/^\d{1,2}\/\d{1,2}$/)), v.literal("free")]),
	key: Key,
	/** Key changes after the start, in order; empty when the song stays in one key. */
	keyChanges: v.optional(
		v.pipe(v.array(v.object({ at: v.pipe(v.number(), v.minValue(0)), key: Key })), v.maxLength(24)),
		[],
	),
	notes: v.optional(v.pipe(v.string(), v.maxLength(400)), ""),
});
/** The answer after `chartStatedAnswer`: tempo and meter the chart's own, null where it states neither. */
export type AiAnswer = Omit<v.InferOutput<typeof AnswerSchema>, "meter"> & {
	meter: string | null;
	/** What looked wrong in the chart read (utils/chartReadWarnings.ts) or in the settings against it (utils/settingsChartDisagreement.ts): the page shows them and does not apply the answer unasked. */
	warnings?: string[];
};

/** The mix from Blob, as the bytes the model listens to. */
async function loadMix(mixUrl: string): Promise<Uint8Array> {
	const res = await readBlob(mixUrl);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} reading the mix`);
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("The mix is too large to send");
	return bytes;
}

/** How a score's barmark read is described to the listening model. */
const BARMARK_READ_NOTE =
	', as a chart read from the score in barmark notation: "key:", "time:" and "tempo:" lines where they are set or change, one cell between pipes per written measure ("/" holds the harmony before it), "|:" and ":|" repeats, "|1" and "|2" endings, directions (Segno, To Coda, D.S. al Coda) and rehearsal marks ("@A") as cells of their own, "##" section headings and quoted words';

const CHART_NOTE = (chart: ScorePart) =>
	`The song's own chart comes with the recording${
		chart.chord
			? ', as the band wrote it: its sections, the chords of each (one per bar unless it says otherwise, with repeats as "x2"), sometimes the words. It has no key signatures and marks no bars: read each part\'s key from the chords it moves through, and follow its sections in the recording'
			: chart.text
				? `${chart.barmark ? BARMARK_READ_NOTE : ", as a measure-by-measure summary (key signatures, time signatures, tempo marks, repeats, rehearsal marks and chord symbols)"}${chart.file ? " and as the file it was read from" : ""}`
				: ""
	}. First make sure it is the chart of this recording (the same piece: its harmony, meter and form match what you hear); if it plainly is not, set it aside, answer from the recording alone and say so in "notes".`;

/**
 * One question to the listening model about a mix, with the song's score
 * beside it when it has one: the request and the answer logged to
 * `ai_request` under `kind`, the JSON in the reply parsed with `schema`.
 * Throws when the model does not answer or answers nonsense.
 */
async function listen<S extends v.GenericSchema>(opts: {
	kind: string;
	who: { userId: string; songId: string };
	mix: Uint8Array;
	score: ScoreForAi | null;
	chart: ScorePart | null;
	system: string;
	question: string;
	schema: S;
}): Promise<v.InferOutput<S>> {
	if (!ENV.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not configured");
	const { mix, chart, score, system, question } = opts;
	const gateway = createGateway({ apiKey: ENV.AI_GATEWAY_API_KEY });
	const started = Date.now();
	const withFile = chart?.file
		? ` and ${chart.file.filename} (${chart.file.data.byteLength} bytes)`
		: "";
	const withText = chart?.text ? `\n\nCHART (${scoreName(score)}):\n${chart.text}` : "";
	const log = {
		kind: opts.kind,
		model: MODEL,
		userId: opts.who.userId,
		songId: opts.who.songId,
		prompt: `SYSTEM:\n${system}\n\nUSER (with mix.mp3, ${mix.byteLength} bytes${withFile}):\n${question}${withText}`,
	};
	let text = "";
	let usage: { inputTokens?: number; outputTokens?: number } = {};
	try {
		const result = await generateText({
			model: gateway(MODEL),
			system,
			messages: [
				{
					role: "user",
					content: [
						{ type: "file", data: mix, mediaType: "audio/mpeg", filename: "mix.mp3" },
						...(chart?.file
							? [
									{
										type: "file" as const,
										data: chart.file.data,
										mediaType: chart.file.mediaType,
										filename: chart.file.filename,
									},
								]
							: []),
						{
							type: "text",
							text: chart?.text
								? `${question}\n\nThe chart, from ${scoreName(score)}:\n${chart.text}`
								: question,
						},
					],
				},
			],
		});
		text = result.text;
		usage = { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens };
	} catch (e) {
		await logAiRequest({
			...log,
			error: e instanceof Error ? e.message : String(e),
			durationMs: Date.now() - started,
		});
		throw e;
	}
	const durationMs = Date.now() - started;
	const json = text.match(/\{[\s\S]*\}/)?.[0];
	let parsed: v.SafeParseResult<S> | null = null;
	try {
		parsed = json ? v.safeParse(opts.schema, JSON.parse(json)) : null;
	} catch {
		parsed = null;
	}
	const error = !json
		? "The model did not answer in the expected form"
		: parsed?.success
			? null
			: "The model's answer did not make sense";
	await logAiRequest({
		...log,
		response: text,
		parsed: parsed?.success ? parsed.output : null,
		error,
		durationMs,
		inputTokens: usage.inputTokens ?? null,
		outputTokens: usage.outputTokens ?? null,
	});
	if (error || !parsed?.success) throw new Error(error ?? "The model's answer did not make sense");
	return parsed.output;
}

/** The song's own settings, for following the chart's bars in the recording (never the key: a handed key is echoed, FINDINGS.md). */
export interface SongSettings {
	tempo: string | null;
	meter: string | null;
}

/**
 * The song-check (docs/audio-engine.md, "The song-check reads the chart"):
 * the model reads the chart beside the mix and reports the keys and where
 * they change, the time signature and the tempo marks, placed in the
 * recording. The answer's tempo and meter are the chart's own, parsed from
 * its text (`chartStatedAnswer`), with a warning when the settings the
 * model followed the bars by disagree with them. Throws when the chart cannot be read or the
 * model does not answer.
 */
export async function askAiAboutMix(
	mixUrl: string,
	settings: SongSettings,
	who: AiAsker,
	score: ScoreForAi,
): Promise<AiAnswer> {
	const mix = await loadMix(mixUrl);
	const chart = await loadScore(score, mix.byteLength, who);
	if (!chart) throw new Error("The song's chart could not be read");
	const known = [
		settings.tempo ? `tempo ${settings.tempo} bpm` : null,
		settings.meter ? `time signature ${settings.meter}` : null,
	].filter(Boolean);
	const system = `You are a musician with perfect time and pitch, reading a song's chart while its recording plays. ${CHART_NOTE(chart)} Report:
- "key": the key at the start, like "D major" or "B minor", from the chart's key signature and the chords it opens with; "atonal" if it has none.
- "keyChanges": where the song moves to another key, as a list of {"at": seconds from the start, "key": the new key}, in order. The chart's key signatures and the chords it moves through say what key each part is in, more surely than the ear does. Use the recording to place each change in seconds: follow the chart's bars at the tempo you hear, counting repeats as played. A passing or borrowed chord is not a key change; a section that settles in a new key is. Empty list when the song stays in one key.
- "meter": the time signature the chart states (like 4/4, 3/4, 6/8); "free" when it marks none.
- "tempo": the beats per minute of the chart's tempo mark at the start; null when the chart has no tempo mark. Do not estimate a tempo by ear.
- "tempoChanges": the chart's later tempo marks, as a list of {"at": seconds from the start, "bpm": the new tempo}, in order, placed in the recording the same way; empty when it has none.
- "notes": one short sentence on anything uncertain. If the recording departs from the chart (a different key, a cut section), say so here and answer for the recording.
Reply with JSON only, no prose, exactly: {"tempo": 128, "tempoChanges": [], "meter": "4/4", "key": "D major", "keyChanges": [{"at": 62, "key": "F major"}], "notes": "..."}`;
	const question = `${known.length ? `The song's settings say: ${known.join(", ")}; use them to follow the bars. ` : ""}In which keys is this recording, and where does each begin? What time signature and tempo marks does the chart state?`;
	const answer = await listen({
		kind: "song-check",
		who,
		mix,
		score,
		chart,
		system,
		question,
		schema: AnswerSchema,
	});
	// A read score is checked for the signs of a bad read (docs/audio-engine.md "The chart read is checked"); the band's own chart is not a read.
	const warnings = chart.text && !chart.chord ? chartReadWarnings(chart.text) : [];
	const gated = chartStatedAnswer(answer, chart.text);
	// Settings that disagree with the chart misplace the key changes the model counts bars for (stem-bench Study 7).
	const disagreement = settingsChartDisagreement(settings, gated);
	if (disagreement) warnings.push(disagreement);
	return { ...gated, ...(warnings.length ? { warnings } : {}) };
}

const SectionsAnswerSchema = v.object({
	sections: v.pipe(
		v.array(
			v.object({
				at: v.pipe(v.number(), v.minValue(0)),
				name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
			}),
		),
		v.maxLength(64),
	),
	notes: v.optional(v.pipe(v.string(), v.maxLength(400)), ""),
});
export type SectionsAnswer = v.InferOutput<typeof SectionsAnswerSchema>;

/**
 * The song's sections from the listening model (docs/audio-engine.md,
 * "Detect sections"): where each begins in seconds and its name, the
 * chart's rehearsal marks and words leading when the song has a score,
 * the names the account's other songs use as the vocabulary.
 */
export async function detectSectionsWithAi(
	mixUrl: string,
	context: {
		tempo: string | null;
		meter: string | null;
		existing: { name: string; start: number }[];
		/** Section names the account's other songs use, most common first. */
		vocabulary: string[];
	},
	who: AiAsker,
	score: ScoreForAi | null = null,
): Promise<SectionsAnswer> {
	const mix = await loadMix(mixUrl);
	const chart = score ? await loadScore(score, mix.byteLength, who) : null;
	const system = `You are a musician with perfect time who knows song form. Listen to the whole recording and split it into its sections (Intro, Verse, Pre-chorus, Chorus, Bridge, Solo, Interlude, Breakdown, Outro; "Verse 2" and "Chorus 2" for repeats when that helps). Report:
- "sections": the list in order, each {"at": seconds from the start where it begins, "name": its name}. The first begins at 0. A section is a stretch with its own material or function, usually 4 to 32 bars; place each boundary on the downbeat where the new section starts, precise to the tenth of a second. A pickup belongs to the section it leads into.
- "notes": one short sentence on anything uncertain.
Reply with JSON only, no prose, exactly: {"sections": [{"at": 0, "name": "Intro"}, {"at": 14.2, "name": "Verse"}], "notes": "..."}${
		chart
			? `
${CHART_NOTE(chart)} Take the sections from the chart where it marks them (rehearsal marks, words such as "Verse" or "Chorus", double bars, repeats and endings), and use the recording to place each in seconds, following the bars at the tempo you hear and counting repeats as played. If the recording departs from the chart, follow the recording and say so in "notes".`
			: ""
	}`;
	const facts = [
		context.tempo ? `tempo ${context.tempo} bpm` : null,
		context.meter ? `time signature ${context.meter}` : null,
	].filter(Boolean);
	const question = [
		facts.length ? `The song's settings say: ${facts.join(", ")}.` : null,
		context.vocabulary.length
			? `This band names its sections with words like: ${context.vocabulary.slice(0, 12).join(", ")}. Use those where they fit.`
			: null,
		context.existing.length
			? `It already has sections: ${context.existing.map((s) => `${s.name} at ${s.start.toFixed(1)} s`).join(", ")}. Keep their names and starts unless the recording plainly says otherwise.`
			: null,
		"Where does each section of this song begin, and what is it?",
	]
		.filter(Boolean)
		.join(" ");
	return listen({
		kind: "sections",
		who,
		mix,
		score,
		chart,
		system,
		question,
		schema: SectionsAnswerSchema,
	});
}

export interface ChartDraftInput {
	title: string;
	tempo: string | null;
	key: string | null;
	meter: string | null;
	existingSections: { name: string; bar: number }[];
	bars: BarNotesInput[];
	/** Who named the chords: the notes' template matcher (a hint), or the chord model that read the mix (an answer to color). */
	source: "matcher" | "model";
	/** The chart `chartFromDetections` built on the song's bar grid (src/lib/server/chartBuild.ts), for the model to refine. */
	startingChart: string;
	/** Its played bars, which the refined chart must keep for its timing map to hold. */
	barCount: number;
	examples: { title: string; sections: { name: string }[]; chart: string }[];
}

/**
 * One line per bar for the draft prompt: the transcribed notes, through the
 * starting chart's last bar or the notes' last, whichever is later; "(not
 * transcribed)" on every line when the chords came from the chord model
 * before the stems were transcribed (`bars` empty).
 */
export function draftBarLines(input: Pick<ChartDraftInput, "bars" | "barCount">): string {
	const notes = new Map(input.bars.map((b) => [b.bar, b.notes]));
	const last = Math.max(input.barCount, ...notes.keys());
	const lines: string[] = [];
	for (let bar = 1; bar <= last; bar++) {
		const heard = notes.get(bar);
		lines.push(`bar ${bar}: ${heard ?? (input.bars.length ? "" : "(not transcribed)")}`);
	}
	return lines.join("\n");
}

/** The draft's instructions: how to read the starting chart and the bars, by who named their chords (`source`). */
function draftSystemPrompt(source: ChartDraftInput["source"]): string {
	return `You are a music director preparing a chord chart for a band from their recording.
You get a STARTING CHART in barmark, the band's chart notation, built from a chord detector's read of the song on its bar grid: one played bar per bar of the recording, timed to it bar by bar. ${
		source === "model"
			? "The detector is a chord recognition model that read the band's mix: on a real recording it names about three bars in four right, and it hears roots and plain qualities (major, minor, 7ths, dim, sus) only, never a power chord, a slash bass or a color the band would play. Keep its roots unless the notes plainly contradict them; spell the chords the way this band would. "
			: "The detector is a simple template matcher on the transcribed notes: its chords are a hint, not an answer. "
	}For each bar you also get the notes an automatic transcriber (Spotify Basic Pitch) heard, lowest to highest, as pitch+octave×seconds sounding@loudness 0..1. The transcription is noisy: weak, short notes are often wrong; long, loud, low notes are reliable. Some bars may have no notes yet: the starting chart is all you have for them. You also get the tempo, key and time signature, and the way this band writes its charts (examples). Do four things:
0. Name the chord in every bar, in this band's chart notation (D, Bm, A7, G5, D7sus4, Dsus4, G/B); think like a rock musician reading a chart — simple, plausible progressions in the key over exotic spellings; power chords (5) and sus chords are common here. Give them as ONE space-separated string in bar order, "%" for a bar that repeats the previous chord and "N.C." for silence — e.g. "D7sus4 % % C5 G5 D7sus4 % %".
1. Split the song into sections (Intro, Verse, Chorus, Bridge, Solo, Outro… reuse names the band uses; a section that comes back keeps the same name). Each section gets a name and the bar it starts on. If the song already has sections, keep their names and starts unless the chords plainly say otherwise.
2. Write each section's chord progression as a compact line, one chord per bar, "|"-separated, with "x2"/"x4" for repeats, in the band's own notation (see the examples: e.g. "| D | A | Bm | G |").
3. Refine the starting chart into the band's chart: keep exactly as many played bars as it has, in the same order, every bar written out where it plays; correct chord spellings against the notes; add or rename sections as "## Name" headings; write a repeated bar as "%" within a line only — no "x2" line repeats and no bare headings that replay a section, which would change the bar count; keep its key, time and tempo lines. No roman numerals in headings. Do not invent lyrics.
Reply with JSON only, no prose before or after, keep the chart under 8000 characters: {"chords":"D7sus4 % % C5 G5 …","sections":[{"name":"Intro","bar":1},…],"progressions":[{"section":"Intro","chords":"…"}],"chart":"markdown…","notes":"one sentence on anything uncertain"}`;
}

/**
 * From the starting chart built on the detected chords (chartBuild.ts) and
 * the notes per bar, the model names the sections, the progression of
 * each, and refines the chart in the account's own style, keeping its bar
 * count (two of its
 * songs' charts and section lists ride along as examples). Text only.
 */
export async function draftChartWithAi(
	input: ChartDraftInput,
	who: { userId: string; songId: string },
): Promise<ChartDraftAnswer> {
	if (!ENV.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not configured");
	const gateway = createGateway({ apiKey: ENV.AI_GATEWAY_API_KEY });
	const barLines = draftBarLines(input);
	const examples = input.examples
		.map(
			(e, i) =>
				`EXAMPLE ${i + 1}: "${e.title}"\nsections: ${e.sections.map((s) => s.name).join(", ")}\nchart:\n${e.chart}`,
		)
		.join("\n\n");
	const system = draftSystemPrompt(input.source);
	const question = `SONG: "${input.title}"${input.tempo ? `, ${input.tempo} bpm` : ""}${input.key ? `, ${input.key}` : ""}${input.meter ? `, ${input.meter}` : ""}
${input.existingSections.length ? `EXISTING SECTIONS: ${input.existingSections.map((s) => `${s.name} @ bar ${s.bar}`).join(", ")}\n` : ""}STARTING CHART, built from the chord detector on the song's bar grid (${input.barCount} bars). Refine it: keep exactly ${input.barCount} played bars, in order; correct chord spellings against the notes, add or rename sections (## headings), write repeats as % within a line only; keep key/time/tempo lines.
${input.startingChart}

NOTES PER BAR:
${barLines}

${examples ? `THIS BAND'S CHARTS, FOR STYLE:\n${examples}` : "No example charts yet; use clear markdown with a heading per section."}`;
	const started = Date.now();
	const log = {
		kind: "chart-draft",
		model: DRAFT_MODEL,
		userId: who.userId,
		songId: who.songId,
		prompt: `SYSTEM:\n${system}\n\nUSER:\n${question}`,
	};
	let text = "";
	let usage: { inputTokens?: number; outputTokens?: number } = {};
	try {
		// A prompt can come back with no text at all (0 output tokens, reproducible for
		// one song in stem-bench Study 1, FINDINGS.md "AI features"): one more try.
		for (let attempt = 1; attempt <= 2 && !text.trim(); attempt++) {
			const result = await generateText({
				model: gateway(DRAFT_MODEL),
				system,
				prompt: question,
				maxOutputTokens: 8000,
				// Fable thinks adaptively by default and can spend the whole output budget on
				// it for 150 bars of notes; low effort answered in 50 s where default hit the cap.
				providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } },
			});
			text = result.text;
			usage = { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens };
			if (!text.trim() && attempt === 1)
				await logAiRequest({
					...log,
					response: "",
					error: "The model returned an empty completion; retried",
					durationMs: Date.now() - started,
					inputTokens: usage.inputTokens ?? null,
					outputTokens: usage.outputTokens ?? null,
				});
		}
	} catch (e) {
		await logAiRequest({
			...log,
			error: e instanceof Error ? e.message : String(e),
			durationMs: Date.now() - started,
		});
		throw e;
	}
	const json = text.match(/\{[\s\S]*\}/)?.[0];
	let parsed: v.SafeParseResult<typeof ChartDraftAnswerSchema> | null = null;
	try {
		parsed = json ? v.safeParse(ChartDraftAnswerSchema, JSON.parse(json)) : null;
	} catch {
		parsed = null;
	}
	const error = !json
		? "The model did not answer in the expected form"
		: parsed?.success
			? null
			: "The model's answer did not make sense";
	await logAiRequest({
		...log,
		response: text,
		parsed: parsed?.success ? parsed.output : null,
		error,
		durationMs: Date.now() - started,
		inputTokens: usage.inputTokens ?? null,
		outputTokens: usage.outputTokens ?? null,
	});
	if (error || !parsed?.success) throw new Error(error ?? "The model's answer did not make sense");
	return parsed.output;
}

/**
 * One text request through the gateway: its text and token usage, or, when
 * the transport fails, the failure logged to `ai_request` and thrown.
 */
async function generateLogged(
	log: { kind: string; model: string; userId: string; songId: string; prompt: string },
	started: number,
	request: Parameters<typeof generateText>[0],
): Promise<{ text: string; usage: { inputTokens?: number; outputTokens?: number } }> {
	try {
		const result = await generateText(request);
		return {
			text: result.text,
			usage: { inputTokens: result.usage?.inputTokens, outputTokens: result.usage?.outputTokens },
		};
	} catch (e) {
		await logAiRequest({
			...log,
			error: e instanceof Error ? e.message : String(e),
			durationMs: Date.now() - started,
		});
		throw e;
	}
}

/** stem-bench Study 13's registered reconciler prompt, verbatim. */
const RECONCILE_SYSTEM = `You are a careful music copyist. A chord detector produced one chord per bar for a song, from machine-transcribed notes. Correct the detector's mistakes using only the evidence given: the song's key, the transcribed notes in each bar, and the detected chord. Change a chord only when the notes clearly support a different one; prefer the detected chord when the evidence is ambiguous. If a bar's notes are silent or purely percussive, answer "N.C." for that bar; never invent harmony. Use plain chord symbols (C, Cm, C7, Cmaj7, Cm7, Csus4, C5 and the like). Reply with JSON only, exactly: {"chords": ["...", one entry per bar in order]}`;

/** What the chord reconciler reads: the song's key, meter and tempo at 0:00, the detector's chord per bar, the notes per bar. */
export interface ChordReconcileInput {
	key: string | null;
	meter: string | null;
	tempo: string | null;
	chords: string[];
	bars: BarNotesInput[];
}

/**
 * The detector's chord per bar checked against the transcribed notes by
 * the draft model (stem-bench Study 13: 38 % of bars right on a real
 * recording, 54 % after this pass with no bar broken). Symbols in,
 * symbols out; text only. An answer that does not parse comes back as
 * `{ chords: null, error }` (the page keeps the detector's chords); only
 * a transport failure throws, after it is logged. Logged as
 * `chord-reconcile`.
 */
export async function reconcileChordsWithAi(
	input: ChordReconcileInput,
	who: { userId: string; songId: string },
): Promise<{ chords: string[] | null; error: string | null }> {
	if (!ENV.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not configured");
	const gateway = createGateway({ apiKey: ENV.AI_GATEWAY_API_KEY });
	const question = reconcileChordsMessage(input);
	const started = Date.now();
	const log = {
		kind: "chord-reconcile",
		model: DRAFT_MODEL,
		userId: who.userId,
		songId: who.songId,
		prompt: `SYSTEM:\n${RECONCILE_SYSTEM}\n\nUSER:\n${question}`,
	};
	const { text, usage } = await generateLogged(log, started, {
		model: gateway(DRAFT_MODEL),
		system: RECONCILE_SYSTEM,
		prompt: question,
		// Every 4000-token pilot truncated: the model narrates bar by bar before the JSON.
		maxOutputTokens: 16000,
		// As the draft. The bench ran without thinking and at temperature 0, which the
		// gateway ignored for this model.
		providerOptions: { anthropic: { thinking: { type: "adaptive" }, effort: "low" } },
	});
	const answer = parseReconciledChords(text, input.chords.length);
	await logAiRequest({
		...log,
		response: text,
		parsed: answer.chords ? { chords: answer.chords } : null,
		error: answer.error,
		durationMs: Date.now() - started,
		inputTokens: usage.inputTokens ?? null,
		outputTokens: usage.outputTokens ?? null,
	});
	return answer;
}
