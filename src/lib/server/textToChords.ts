import { ENV } from "varlock/env";
import { AUTO_STRUM_PATTERNS } from "$lib/constants/autoStrum";
import { CHORD_STYLES } from "$lib/constants/chordStyles";
import { CHORD_VOICINGS, STRUMS } from "$lib/constants/circleOfFifths";
import { PIANO_INSTRUMENTS } from "$lib/constants/piano";
import { logAiRequest } from "$lib/server/data";
import { parseTextToChordsReply, type TextToChordsResult } from "$lib/utils/parseTextToChordsReply";
import { KEY_NAMES, type TextToChordsInput } from "$lib/val/TextToChordsSchema";
import { complete, textToBeatModel, type Message } from "./textToBeat";

/**
 * Text-to-Progression (docs/chord-player.md, "Text-to-Progression"): a
 * chord progression described in words becomes one on the pad through the
 * same gateway call as Text-to-Beat (textToBeat.ts: reasoning off, the
 * same model), the model writing chords as Roman numerals relative to a
 * key with their beats, which `parseTextToChordsReply` checks; a reply
 * that fails gets one more go with the reason. Every call is logged
 * (ai_request, kind "text-to-chords").
 */
export async function textToChords(
	input: TextToChordsInput,
	who: { userId: string | null },
): Promise<TextToChordsResult & { model: string }> {
	const key = ENV.AI_GATEWAY_API_KEY;
	if (!key) throw new Error("AI_GATEWAY_API_KEY is not configured");
	const model = textToBeatModel();
	const messages: Message[] = [
		{ role: "system", content: systemPrompt(input) },
		{ role: "user", content: input.prompt },
	];
	let lastError = "";
	for (let attempt = 0; attempt < 2; attempt++) {
		const started = Date.now();
		const log = {
			kind: "text-to-chords",
			model,
			userId: who.userId,
			songId: null,
			prompt: messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n"),
		};
		let text = "";
		let usage: { inputTokens?: number; outputTokens?: number } = {};
		try {
			({ text, usage } = await complete(key, model, messages));
		} catch (e) {
			await logAiRequest({
				...log,
				error: e instanceof Error ? e.message : String(e),
				durationMs: Date.now() - started,
			});
			throw e;
		}
		try {
			const parsed = parseTextToChordsReply(text, input.beatsPerBar);
			await logAiRequest({
				...log,
				response: text,
				parsed,
				durationMs: Date.now() - started,
				...usage,
			});
			return { ...parsed, model };
		} catch (e) {
			lastError = e instanceof Error ? e.message : String(e);
			await logAiRequest({
				...log,
				response: text,
				error: lastError,
				durationMs: Date.now() - started,
				...usage,
			});
			messages.push(
				{ role: "assistant", content: text },
				{
					role: "user",
					content: `That reply was rejected: ${lastError}. Reply again with the JSON object only.`,
				},
			);
		}
	}
	throw new Error(`The model's answer could not be read (${lastError})`);
}

/** The instructions: the notation (Roman numerals in a key), the meter, the styles on offer, and an example. */
function systemPrompt(input: TextToChordsInput): string {
	const styles = CHORD_STYLES.map((s) => `"${s.id}" (${s.label}: ${s.hint})`).join("; ");
	const sounds = PIANO_INSTRUMENTS.map((i) => `"${i.id}" (${i.label})`).join(", ");
	const voicings = CHORD_VOICINGS.map((c) => `"${c.id}" (${c.hint})`).join("; ");
	const strums = STRUMS.map((s) => `"${s.id}"`).join(", ");
	const patterns = AUTO_STRUM_PATTERNS.map((p) => `"${p.id}" (${p.label})`).join(", ");
	const key = KEY_NAMES[input.key] ?? "C";
	const bar =
		input.beatsPerBar === 3 ? "three beats to the bar (3/4)" : "four beats to the bar (4/4)";
	return `You are a musician with great taste writing a chord progression for a player that shows the chords of a key on a circle of fifths.
Write the chords as Roman numerals relative to the key: uppercase for a major chord (I, IV, V, bVII, II for a secondary dominant), lowercase for a minor one (ii, iii, vi, #iv). The degrees available are I, II, III, IV, V, VI, VII and the borrowed bII, bIII, #IV (or bV), bVI and bVII; write a diminished chord as a minor (vii). Add "seventh": true on a chord that wants its seventh (the player gives a major chord a dominant or major seventh by style, a minor its minor seventh). Give each chord "beats": 1, 2 or 4; the pad is in ${bar}, so a chord a bar is ${input.beatsPerBar === 3 ? "2 beats here, " : ""}4 beats in 4/4 and two chords a bar 2 each. Use 4 to 32 chords: enough bars to make the progression's point, a whole form for a blues or a song section, repeats written out.
The player is in the key of ${key} with the "${input.style}" style on. Suggest "key" (one of ${KEY_NAMES.map((k) => `"${k}"`).join(", ")}) only when the description names one or the music wants one; leave it out otherwise. Suggest "style" from these when one suits the description better than the one on: ${styles}. Suggest "bpm" (an integer, 40 to 240) for the feel, a short "name" (under 40 characters) and a "note": one short sentence on the progression and how to play it.
You may also set the player up for the progression with "setup", any of these, only the ones the description calls for (the player keeps the rest as it is): "sound", one of ${sounds}; "mode", "chords" or "notes" (notes plays single notes); "voicing", one of ${voicings}; "strum", one of ${strums} (how far apart a chord's notes sound; "off" plays them together), with "strumDirection" ("down", "up", "alternate"), "strumPattern" (what a held chord keeps strumming, one of ${patterns}) and "strumSpeed" ("8" or "16"); "arp", an arpeggiator, {"on": true, "rate": "4" | "8" | "8t" | "16", "pattern": "up" | "down" | "updown" | "played" | "random", "octaves": 1 to 3, "gate": 10 to 100 (percent of each step the note sounds), "latch": true to keep it going after the wedge is let go, "swing": 0 to 100, "ratio": 0.5 | 1 | 2 (half-time, with the tempo, double-time)}; "octave", 2 to 6 (4 is middle); "sustain", true for the pedal down; "effects" as percentages, {"reverb", "reverbSize", "delay", "chorus"}, 20 to 40 tasteful, 60 and up a lot. A guitar song wants "guitar" and a strum, a pad or synth with an arpeggio wants "arp" on, a ballad a little reverb and sustain.
Reply with JSON only, no prose, no markdown, exactly like: {"name": "Doo-wop turnaround", "bpm": 110, "style": "plain", "note": "The fifties four, round and round.", "chords": [{"degree": "I", "beats": 2}, {"degree": "vi", "beats": 2}, {"degree": "IV", "beats": 2}, {"degree": "V", "beats": 2}]} or, with sevenths and a key, {"name": "Autumn turnaround", "bpm": 120, "key": "Bb", "style": "jazz", "note": "A ii–V–I in the major, then its relative minor's.", "setup": {"sound": "epiano", "voicing": "rich", "strum": "slow", "strumPattern": "once", "effects": {"reverb": 35}}, "chords": [{"degree": "ii", "seventh": true, "beats": 4}, {"degree": "V", "seventh": true, "beats": 4}, {"degree": "I", "seventh": true, "beats": 4}, {"degree": "IV", "seventh": true, "beats": 4}, {"degree": "vii", "seventh": true, "beats": 4}, {"degree": "III", "seventh": true, "beats": 4}, {"degree": "vi", "beats": 4}, {"degree": "vi", "beats": 4}]} or, for a synth arpeggio, {"name": "Night drive", "bpm": 118, "style": "plain", "note": "Four chords under a running arpeggio.", "setup": {"sound": "synth", "arp": {"on": true, "rate": "16", "pattern": "up", "octaves": 2, "latch": true}, "effects": {"delay": 30, "reverb": 30}}, "chords": [{"degree": "vi", "beats": 4}, {"degree": "IV", "beats": 4}, {"degree": "I", "beats": 4}, {"degree": "V", "beats": 4}]}`;
}
