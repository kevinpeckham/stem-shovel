import { readBlob } from "#lib/server/blob.js";
import { logAiRequest } from "#lib/server/data.js";
import { createGateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import {
	type BarNotesInput,
	type ChartDraftAnswer,
	ChartDraftAnswerSchema,
	type ChordSegmentInput,
} from "#lib/val/ChartDraftSchema.js";
import * as v from "valibot";
import { ENV } from "varlock/env";
import { FILE_CONTENT_TYPE_OF } from "#lib/constants/fileFormats.js";
import { redisConfigured, redisPipeline } from "#lib/server/redis.js";
import { createHash } from "node:crypto";
import { musicXmlFromMxl } from "#lib/utils/musicXmlFromMxl.js";
import { musicXmlSummary } from "#lib/utils/musicXmlSummary.js";

/**
 * A second opinion on a song's tempo, key and time signature from a model
 * that can listen, through Vercel's AI Gateway (replicator's pattern:
 * `@ai-sdk/gateway` + `ai`). The deterministic detector runs at upload
 * (src/lib/audio/analysis.ts); this is for the cases it is unsure about,
 * meter above all. Off entirely without AI_GATEWAY_API_KEY.
 */
const MODEL = "google/gemini-3-flash";
/** The chart draft reads transcribed notes, no listening needed: a frontier text model reads them best (docs/audio-engine.md). */
const DRAFT_MODEL = "anthropic/claude-fable-5-1";
/** Gemini takes inline audio up to about 20 MB; the mixes are MP3s of a few MB. */
const MAX_AUDIO_BYTES = 18 * 1024 * 1024;
/** The mix and a score PDF or image go in one request, under Gemini's inline limit together. */
const MAX_REQUEST_BYTES = 19 * 1024 * 1024;

export const aiAvailable = () => !!ENV.AI_GATEWAY_API_KEY;

export interface Candidates {
	tempo: string | null;
	key: string | null;
	meter: string | null;
}

/**
 * The score the model reads beside the mix (docs/audio-engine.md, "The
 * score as the AI's chart"): a MusicXML file as the text summary of its
 * keys and chords, or a PDF or image of the chart as the file itself.
 */
export type ScoreForAi =
	| { kind: "musicxml"; format: "mxl" | "musicxml"; url: string; filename: string; title: string }
	| { kind: "pdf" | "image"; url: string; filename: string; title: string; sizeBytes: number };
/** What the request carries for the chart: its per-measure summary as text, the PDF or image itself, or both. */
interface ScorePart {
	text?: string;
	file?: { data: Uint8Array; mediaType: string; filename: string };
}

/**
 * Reads the score from Blob into what the request carries: a MusicXML as
 * its summary; a PDF or image as the summary a reading model makes of it
 * (`readChartWithAi`) plus the file itself when it fits beside the mix.
 * Null when nothing could be read.
 */
async function loadScore(
	score: ScoreForAi,
	audioBytes: number,
	who: { userId: string; songId: string },
): Promise<ScorePart | null> {
	const res = await readBlob(score.url);
	if (!res.ok) return null;
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (score.kind === "musicxml") {
		const xml = score.format === "mxl" ? musicXmlFromMxl(bytes) : new TextDecoder().decode(bytes);
		const summary = xml ? musicXmlSummary(xml) : "";
		return summary ? { text: summary } : null;
	}
	const mediaType = FILE_CONTENT_TYPE_OF(score.filename);
	const text = await readChartWithAi(score, bytes, mediaType, who).catch(() => "");
	const file =
		audioBytes + bytes.byteLength <= MAX_REQUEST_BYTES
			? { data: bytes, mediaType, filename: score.filename }
			: undefined;
	return text || file ? { text: text || undefined, file } : null;
}

/** A read chart stays cached this long; the file never changes under its URL (Blob pathnames are never reused). */
const CHART_CACHE_SECONDS = 30 * 24 * 3600;

/**
 * A PDF or image of a chart as the per-measure summary `musicXmlSummary`
 * makes of a MusicXML (docs/audio-engine.md, "The score as the AI's
 * chart"): a text model that reads documents (DRAFT_MODEL) writes the key
 * signature where it changes, the time signature, tempo marks, rehearsal
 * marks and words, repeats and endings, and the chord symbols per measure.
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
	const cacheKey = `chart:${createHash("sha256").update(score.url).digest("hex").slice(0, 32)}`;
	if (redisConfigured()) {
		try {
			const [hit] = await redisPipeline([["GET", cacheKey]]);
			if (typeof hit === "string" && hit) return hit;
		} catch {
			// the cache is a convenience: read the chart again
		}
	}
	const gateway = createGateway({ apiKey: ENV.AI_GATEWAY_API_KEY });
	const system = `You read music notation. The attached file is a song's chart or score. Write it out as a plain-text summary, one line per measure that carries anything of note, in exactly this form and nothing else:

Title: <title>
Part: <the part you read, e.g. "Electric Guitar 1 (3 parts)">
m<number> key <key> <time signature> tempo <bpm> [<rehearsal mark>] "<words>" |: :| ending <n>: <chord symbols in order, separated by spaces>

Rules:
- Number the measures from 1 in order through the whole score (count every measure in every system, on every page; the small numbers at the start of a system are measure numbers, use them to keep count).
- "key": from the key signature, as "C major", "A♭ major", "F minor" (write ♭ and ♯). State it at measure 1 and again at every measure where the key signature changes (naturals cancelling flats or sharps is a change). Prefer the major key for a signature unless the chords plainly sit in the relative minor. A text such as "Key: F Major" in the score confirms it.
- Write the time signature at measure 1 and where it changes; "tempo <bpm>" where a metronome mark appears.
- Rehearsal marks in square brackets ("[A Verse]"), other words in quotes ("Chorus", "rit."); lyrics are not words, leave them out.
- "|:" at a measure that opens a repeat, ":|" at one that closes it, "ending 1" where a first ending starts, and so on; "D.S.", "coda", "fine" as words.
- Chord symbols after a colon, in the order they occur in the measure, as written (Fmaj9, B♭maj7/F, Cm7, N.C.). A measure with no chord symbol and no mark is left out.
- Do not invent anything the score does not show; if a page is unreadable, say so on a final line beginning "Note:".`;
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
						{ type: "text", text: "Summarise this chart as instructed." },
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
	const error = /^m\d+/m.test(text) ? null : "The model did not summarise the chart";
	await logAiRequest({
		...log,
		response: text,
		parsed: error ? null : { lines: text.split("\n").length },
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
	confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	notes: v.optional(v.pipe(v.string(), v.maxLength(400)), ""),
});
export type AiAnswer = v.InferOutput<typeof AnswerSchema>;

/** The mix from Blob, as the bytes the model listens to. */
async function loadMix(mixUrl: string): Promise<Uint8Array> {
	const res = await readBlob(mixUrl);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} reading the mix`);
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("The mix is too large to send");
	return bytes;
}

const CHART_NOTE = (chart: ScorePart) =>
	`The song's own chart comes with the recording${chart.text ? `, as a measure-by-measure summary (key signatures, time signatures, tempo marks, repeats, rehearsal marks and chord symbols)${chart.file ? " and as the file it was read from" : ""}` : ""}. First make sure it is the chart of this recording (the same piece: its harmony, meter and form match what you hear); if it plainly is not, set it aside, answer from the recording alone and say so in "notes".`;

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
	const withText = chart?.text ? `\n\nCHART (${score?.filename}):\n${chart.text}` : "";
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
								? `${question}\n\nThe chart, from ${score?.filename}:\n${chart.text}`
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

export async function askAiAboutMix(
	mixUrl: string,
	candidates: Candidates,
	who: { userId: string; songId: string },
	score: ScoreForAi | null = null,
): Promise<AiAnswer> {
	const mix = await loadMix(mixUrl);
	const chart = score ? await loadScore(score, mix.byteLength, who) : null;
	const known = [
		candidates.tempo ? `tempo ${candidates.tempo} bpm` : null,
		candidates.key ? `key ${candidates.key}` : null,
		candidates.meter ? `time signature ${candidates.meter}` : null,
	].filter(Boolean);
	const system = `You are a musician with perfect time and pitch. Listen to the whole recording and report:
- "tempo": the beats per minute at the start, precise to the beat (not rounded to a multiple of 5 unless it truly is). If the piece has no fixed pulse (rubato, free time, ambient), answer null — that is a valid and common answer; do not invent a number.
- "tempoChanges": any discrete tempo shifts after the start, as a list of {"at": seconds from the start, "bpm": the new tempo}, in order. Gradual drift or a rallentando at the very end is not a shift; a new section at a clearly different tempo is. Empty list when the tempo holds.
- "meter": the time signature (like 4/4, 3/4, 6/8, 7/8, or "free" if there is no meter).
- "key": the key at the start, like "D major" or "B minor"; "atonal" if there is none.
- "keyChanges": where the song moves to another key after the start, as a list of {"at": seconds from the start, "key": the new key}, in order. A passing chord or a borrowed chord is not a key change; a section that settles in a new key is, and so is a modulation up a step for the last chorus. Empty list when the song stays in one key.
- "confidence": 0 to 1 for the whole answer.
- "notes": one short sentence on anything uncertain, such as a half/double-time ambiguity or a modulation.
Reply with JSON only, no prose, exactly: {"tempo": 128, "tempoChanges": [{"at": 95.5, "bpm": 140}], "meter": "4/4", "key": "D major", "keyChanges": [{"at": 62, "key": "F major"}], "confidence": 0.8, "notes": "..."}${
		chart
			? `
${CHART_NOTE(chart)} Take the keys from the chart: its key signatures and the chords it moves through say what key each part is in, more surely than the ear does. Use the recording to place each key change in seconds: follow the chart's bars at the tempo you hear, counting repeats as played. If the recording and the chart disagree (a different key, a cut section), say so in "notes" and answer for the recording.`
			: ""
	}`;
	const question = known.length
		? `A detector estimated: ${known.join(", ")}. Confirm or correct each from what you hear; it cannot tell a free tempo or a tempo shift from a steady one, so check those yourself.`
		: "What are the tempo (or none), any tempo shifts, the time signature, the key and any key changes?";
	return listen({
		kind: "song-check",
		who,
		mix,
		score,
		chart,
		system,
		question,
		schema: AnswerSchema,
	});
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
	confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
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
	who: { userId: string; songId: string },
	score: ScoreForAi | null = null,
): Promise<SectionsAnswer> {
	const mix = await loadMix(mixUrl);
	const chart = score ? await loadScore(score, mix.byteLength, who) : null;
	const system = `You are a musician with perfect time who knows song form. Listen to the whole recording and split it into its sections (Intro, Verse, Pre-chorus, Chorus, Bridge, Solo, Interlude, Breakdown, Outro; "Verse 2" and "Chorus 2" for repeats when that helps). Report:
- "sections": the list in order, each {"at": seconds from the start where it begins, "name": its name}. The first begins at 0. A section is a stretch with its own material or function, usually 4 to 32 bars; place each boundary on the downbeat where the new section starts, precise to the tenth of a second. A pickup belongs to the section it leads into.
- "confidence": 0 to 1 for the whole answer.
- "notes": one short sentence on anything uncertain.
Reply with JSON only, no prose, exactly: {"sections": [{"at": 0, "name": "Intro"}, {"at": 14.2, "name": "Verse"}], "confidence": 0.8, "notes": "..."}${
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
	existingSections: { index: string; name: string; bar: number }[];
	chords: ChordSegmentInput[];
	bars: BarNotesInput[];
	examples: { title: string; sections: { index: string; name: string }[]; chart: string }[];
}

/**
 * From the detected chords, the model names the sections, the progression
 * of each, and drafts the chart in the account's own style (two of its
 * songs' charts and section lists ride along as examples). Text only.
 */
export async function draftChartWithAi(
	input: ChartDraftInput,
	who: { userId: string; songId: string },
): Promise<ChartDraftAnswer> {
	if (!ENV.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not configured");
	const gateway = createGateway({ apiKey: ENV.AI_GATEWAY_API_KEY });
	const hint = new Map<number, string>();
	for (const c of input.chords) {
		for (let i = 0; i < c.bars; i++) hint.set(c.bar + i, i === 0 ? c.chord : "%");
	}
	const barLines = input.bars
		.map(
			(b) => `bar ${b.bar}${hint.has(b.bar) ? ` [matcher: ${hint.get(b.bar)}]` : ""}: ${b.notes}`,
		)
		.join("\n");
	const examples = input.examples
		.map(
			(e, i) =>
				`EXAMPLE ${i + 1}: "${e.title}"\nsections: ${e.sections.map((s) => `${s.index} ${s.name}`).join(", ")}\nchart:\n${e.chart}`,
		)
		.join("\n\n");
	const system = `You are a music director preparing a chord chart for a band from a transcription of their recording.
For each bar you get the notes an automatic transcriber (Spotify Basic Pitch) heard, lowest to highest, as pitch+octave×seconds sounding@loudness 0..1. The transcription is noisy: weak, short notes are often wrong; long, loud, low notes are reliable. A simple template matcher's guess follows each bar in brackets — a hint, not an answer. You also get the tempo, key and time signature, and the way this band writes its charts (examples). Do four things:
0. Name the chord in every bar, in this band's chart notation (D, Bm, A7, G5, D7sus4, Dsus4, G/B); think like a rock musician reading a chart — simple, plausible progressions in the key over exotic spellings; power chords (5) and sus chords are common here. Give them as ONE space-separated string in bar order, "%" for a bar that repeats the previous chord and "N.C." for silence — e.g. "D7sus4 % % C5 G5 D7sus4 % %".
1. Split the song into sections (Intro, Verse, Chorus, Bridge, Solo, Outro… reuse names the band uses). Each section gets a roman-numeral index in order (I, II, III…), a name, and the bar it starts on. If the song already has sections, keep their names and starts unless the chords plainly say otherwise.
2. Write each section's chord progression as a compact line, one chord per bar, "|"-separated, with "x2"/"x4" for repeats, in the band's own notation (see the examples: e.g. "D(7)sus4 · D5 x2" or "| D | A | Bm | G |").
3. Draft the chart in markdown in the same style as the examples: a heading per section, the progression under it, a short structure line at the top. Do not invent lyrics.
Reply with JSON only, no prose before or after, keep the chart under 3000 characters: {"chords":"D7sus4 % % C5 G5 …","sections":[{"index":"I","name":"Intro","bar":1},…],"progressions":[{"section":"Intro","chords":"…"}],"chart":"markdown…","notes":"one sentence on anything uncertain"}`;
	const question = `SONG: "${input.title}"${input.tempo ? `, ${input.tempo} bpm` : ""}${input.key ? `, ${input.key}` : ""}${input.meter ? `, ${input.meter}` : ""}
${input.existingSections.length ? `EXISTING SECTIONS: ${input.existingSections.map((s) => `${s.index} ${s.name} @ bar ${s.bar}`).join(", ")}\n` : ""}NOTES PER BAR:
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
