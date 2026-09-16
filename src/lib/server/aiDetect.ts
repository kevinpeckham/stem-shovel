import { readBlob } from "$lib/server/blob";
import { createGateway } from "@ai-sdk/gateway";
import { generateText } from "ai";
import * as v from "valibot";
import { ENV } from "varlock/env";

/**
 * A second opinion on a song's tempo, key and time signature from a model
 * that can listen, through Vercel's AI Gateway (replicator's pattern:
 * `@ai-sdk/gateway` + `ai`). The deterministic detector runs at upload
 * (src/lib/audio/analysis.ts); this is for the cases it is unsure about,
 * meter above all. Off entirely without AI_GATEWAY_API_KEY.
 */
const MODEL = "google/gemini-3-flash";
/** Gemini takes inline audio up to about 20 MB; the mixes are MP3s of a few MB. */
const MAX_AUDIO_BYTES = 18 * 1024 * 1024;

export const aiAvailable = () => !!ENV.AI_GATEWAY_API_KEY;

export interface Candidates {
	tempo: string | null;
	key: string | null;
	meter: string | null;
}

const Bpm = v.pipe(v.number(), v.minValue(20), v.maxValue(400));
const AnswerSchema = v.object({
	/** null = no fixed tempo (rubato, free time). */
	tempo: v.nullable(Bpm),
	/** Discrete tempo shifts after the start, in order; empty when the tempo holds. */
	tempoChanges: v.optional(
		v.pipe(v.array(v.object({ at: v.pipe(v.number(), v.minValue(0)), bpm: Bpm })), v.maxLength(12)),
		[],
	),
	meter: v.union([v.pipe(v.string(), v.regex(/^\d{1,2}\/\d{1,2}$/)), v.literal("free")]),
	key: v.pipe(v.string(), v.trim(), v.maxLength(20)),
	confidence: v.pipe(v.number(), v.minValue(0), v.maxValue(1)),
	notes: v.optional(v.pipe(v.string(), v.maxLength(400)), ""),
});
export type AiAnswer = v.InferOutput<typeof AnswerSchema>;

export async function askAiAboutMix(mixUrl: string, candidates: Candidates): Promise<AiAnswer> {
	if (!ENV.AI_GATEWAY_API_KEY) throw new Error("AI_GATEWAY_API_KEY is not configured");
	const res = await readBlob(mixUrl);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText} reading the mix`);
	const bytes = new Uint8Array(await res.arrayBuffer());
	if (bytes.byteLength > MAX_AUDIO_BYTES) throw new Error("The mix is too large to send");
	const gateway = createGateway({ apiKey: ENV.AI_GATEWAY_API_KEY });
	const known = [
		candidates.tempo ? `tempo ${candidates.tempo} bpm` : null,
		candidates.key ? `key ${candidates.key}` : null,
		candidates.meter ? `time signature ${candidates.meter}` : null,
	].filter(Boolean);
	const { text } = await generateText({
		model: gateway(MODEL),
		system: `You are a musician with perfect time and pitch. Listen to the whole recording and report:
- "tempo": the beats per minute at the start, precise to the beat (not rounded to a multiple of 5 unless it truly is). If the piece has no fixed pulse (rubato, free time, ambient), answer null — that is a valid and common answer; do not invent a number.
- "tempoChanges": any discrete tempo shifts after the start, as a list of {"at": seconds from the start, "bpm": the new tempo}, in order. Gradual drift or a rallentando at the very end is not a shift; a new section at a clearly different tempo is. Empty list when the tempo holds.
- "meter": the time signature (like 4/4, 3/4, 6/8, 7/8, or "free" if there is no meter).
- "key": like "D major" or "B minor"; "atonal" if there is none.
- "confidence": 0 to 1 for the whole answer.
- "notes": one short sentence on anything uncertain, such as a half/double-time ambiguity or a modulation.
Reply with JSON only, no prose, exactly: {"tempo": 128, "tempoChanges": [{"at": 95.5, "bpm": 140}], "meter": "4/4", "key": "D major", "confidence": 0.8, "notes": "..."}`,
		messages: [
			{
				role: "user",
				content: [
					{ type: "file", data: bytes, mediaType: "audio/mpeg", filename: "mix.mp3" },
					{
						type: "text",
						text: known.length
							? `A detector estimated: ${known.join(", ")}. Confirm or correct each from what you hear; it cannot tell a free tempo or a tempo shift from a steady one, so check those yourself.`
							: "What are the tempo (or none), any tempo shifts, the time signature and the key?",
					},
				],
			},
		],
	});
	const json = text.match(/\{[\s\S]*\}/)?.[0];
	if (!json) throw new Error("The model did not answer in the expected form");
	const parsed = v.safeParse(AnswerSchema, JSON.parse(json));
	if (!parsed.success) throw new Error("The model's answer did not make sense");
	return parsed.output;
}
