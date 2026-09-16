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

const AnswerSchema = v.object({
	tempo: v.pipe(v.number(), v.minValue(20), v.maxValue(400)),
	meter: v.pipe(v.string(), v.regex(/^\d{1,2}\/\d{1,2}$/)),
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
		system: `You are a musician with perfect time and pitch. Listen to the recording and report its tempo in beats per minute (a number, precise to the beat, not rounded to a multiple of 5 unless it truly is), its time signature (like 4/4, 3/4, 6/8, 7/8), and its key (like "D major" or "B minor"; write "atonal" if there is none). Reply with JSON only, no prose, in exactly this shape: {"tempo": 128, "meter": "4/4", "key": "D major", "confidence": 0.8, "notes": "one short sentence on anything uncertain"}. Confidence is 0 to 1 for the whole answer.`,
		messages: [
			{
				role: "user",
				content: [
					{ type: "file", data: bytes, mediaType: "audio/mpeg", filename: "mix.mp3" },
					{
						type: "text",
						text: known.length
							? `A detector estimated: ${known.join(", ")}. Confirm or correct each from what you hear.`
							: "What are the tempo, time signature and key?",
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
