import { AUTO_STRUM_PATTERNS } from "#lib/constants/autoStrum.js";
import { CHORD_STYLES } from "#lib/constants/chordStyles.js";
import { CHORD_VOICINGS, CIRCLE_OF_FIFTHS, STRUMS } from "#lib/constants/circleOfFifths.js";
import { PIANO_INSTRUMENTS } from "#lib/constants/piano.js";
import { askForJson, runAi, type Message } from "#lib/server/effect/ai.js";
import {
	parseTextToChordsReply,
	type TextToChordsResult,
} from "#lib/utils/parseTextToChordsReply.js";
import { KEY_NAMES, type TextToChordsInput } from "#lib/val/TextToChordsSchema.js";
import { textToBeatModel } from "./textToBeat";

/**
 * Text-to-Progression (docs/chord-player.md, "Text-to-Progression"): a
 * chord progression described in words becomes one on the pad through the
 * same gateway call as Text-to-Beat (effect/ai.ts: reasoning off, the
 * same model as textToBeat.ts), the model writing a barmark chord chart
 * (its key, meter, tempo and feel in the directives), which
 * `parseTextToChordsReply` reads with barmark's parser; a reply
 * that fails gets one more go with the reason. Every call is logged
 * (ai_request, kind "text-to-chords").
 */
export async function textToChords(
	input: TextToChordsInput,
	who: { userId: string | null },
): Promise<TextToChordsResult & { model: string }> {
	const model = textToBeatModel();
	const messages: Message[] = [
		{ role: "system", content: systemPrompt(input) },
		{ role: "user", content: input.prompt },
	];
	const parsed = await runAi(
		"ai.text-to-chords",
		askForJson({
			kind: "text-to-chords",
			model,
			who,
			messages,
			parse: parseTextToChordsReply,
			rejectionNote: (reason) =>
				`That reply was rejected: ${reason}. Reply again with the JSON object only.`,
		}),
	);
	return { ...parsed, model };
}

/** The instructions: the notation (a barmark chord chart in the player's key and meter), the styles on offer, the setup, and examples. */
function systemPrompt(input: TextToChordsInput): string {
	const styles = CHORD_STYLES.map((s) => `"${s.id}" (${s.label}: ${s.hint})`).join("; ");
	const sounds = PIANO_INSTRUMENTS.map((i) => `"${i.id}" (${i.label})`).join(", ");
	const voicings = CHORD_VOICINGS.map((c) => `"${c.id}" (${c.hint})`).join("; ");
	const strums = STRUMS.map((s) => `"${s.id}"`).join(", ");
	const patterns = AUTO_STRUM_PATTERNS.map((p) => `"${p.id}" (${p.label})`).join(", ");
	const key = KEY_NAMES[input.key] ?? "C";
	const time = input.beatsPerBar === 3 ? "3/4" : "4/4";
	const { I, vi, IV, V } = degreeNames(input.key);
	return `You are a musician with great taste writing a chord progression for a player that shows the chords of a key on a circle of fifths.
Write the progression as "chart", a barmark chord chart in one string (lines joined with \\n). Its first lines are directives: "key: ${key}" (the player's key; write another, e.g. "key: Bb" or "key: Em" for a minor key, only when the description names one or the music wants one), "time: ${time}" (the pad's meter), "tempo: " and an integer from 40 to 240 for the feel, and "feel: swing" only for a swung or shuffled feel (optionally with how far the off-beat lands, 50% to 75%, e.g. "feel: swing 58%" for a light swing). Then a blank line, one "## " heading naming the section, and the bars, four to a line: | G | D/F# | Em7 | C |. Write chords by name with ASCII # and b: G, Am, D7, Em7, Cmaj7, F#m7b5, Bb, D/F#, Asus4, C(9) for an add nine. A bar's slots divide it equally, and / holds the chord before it for another slot: ${input.beatsPerBar === 3 ? "in 3/4 | G | is the whole bar, | G D C | a beat each and | G / D | two beats and one" : "in 4/4 | G D | is two beats each and | G / / D | three beats and one"}. N.C. is a bar or a slot of silence. Use 4 to 32 bars: enough to make the progression's point, a whole form for a blues or a song section, repeats written out (no % and no x2).
The player is in the key of ${key} with the "${input.style}" style on. Suggest "style" from these when one suits the description better than the one on: ${styles}. Give a short "name" (under 40 characters) and a "note": one short sentence on the progression and how to play it.
You may also set the player up for the progression with "setup", any of these, only the ones the description calls for (the player keeps the rest as it is): "sound", one of ${sounds}; "mode", "chords" or "notes" (notes plays single notes); "voicing", one of ${voicings}; "strum", one of ${strums} (how far apart a chord's notes sound; "off" plays them together), with "strumDirection" ("down", "up", "alternate"), "strumPattern" (what a held chord keeps strumming, one of ${patterns}) and "strumSpeed" ("8" or "16"); "arp", an arpeggiator, {"on": true, "rate": "4" | "8" | "8t" | "16", "pattern": "up" | "down" | "updown" | "played" | "random", "octaves": 1 to 3, "gate": 10 to 100 (percent of each step the note sounds), "latch": true to keep it going after the wedge is let go, "swing": 0 to 100, "ratio": 0.5 | 1 | 2 (half-time, with the tempo, double-time)}; "octave", 2 to 6 (4 is middle); "sustain", true for the pedal down; "effects" as percentages, {"reverb", "reverbSize", "delay", "chorus"}, 20 to 40 tasteful, 60 and up a lot. A guitar song wants "guitar" and a strum, a pad or synth with an arpeggio wants "arp" on, a ballad a little reverb and sustain.
Reply with JSON only, no prose, no markdown, exactly like: {"name": "Doo-wop turnaround", "style": "plain", "note": "The fifties four, round and round.", "chart": "key: ${key}\\ntime: ${time}\\ntempo: 110\\n\\n## Doo-wop\\n${dooWop(input)}"} or, with sevenths in another key, {"name": "Autumn turnaround", "style": "jazz", "note": "A ii–V–I in the major, then its relative minor's.", "setup": {"sound": "epiano", "voicing": "rich", "strum": "slow", "strumPattern": "once", "effects": {"reverb": 35}}, "chart": "key: Bb\\ntime: ${time}\\ntempo: 120\\nfeel: swing\\n\\n## Turnaround\\n| Cm7 | F7 | Bbmaj7 | Ebmaj7 |\\n| Am7b5 | D7 | Gm | Gm |"} or, for a synth arpeggio, {"name": "Night drive", "style": "plain", "note": "Four chords under a running arpeggio.", "setup": {"sound": "synth", "arp": {"on": true, "rate": "16", "pattern": "up", "octaves": 2, "latch": true}, "effects": {"delay": 30, "reverb": 30}}, "chart": "key: ${key}\\ntime: ${time}\\ntempo: 118\\n\\n## Drive\\n| ${[vi, IV, I, V].join(" | ")} |"}`;
}

/** The I, vi, IV and V of the player's key by name, ASCII, for the examples. */
function degreeNames(index: number) {
	const at = (steps: number) => CIRCLE_OF_FIFTHS[(index + steps) % 12]!;
	const ascii = (label: string) => label.replace("♯", "#").replace("♭", "b");
	return {
		I: ascii(at(0).major.label),
		vi: ascii(at(0).minor.label),
		IV: ascii(at(11).major.label),
		V: ascii(at(1).major.label),
	};
}

/** The doo-wop example's bars: two chords a bar in 4/4, one in 3/4. */
function dooWop(input: TextToChordsInput): string {
	const { I, vi, IV, V } = degreeNames(input.key);
	return input.beatsPerBar === 3
		? `| ${I} | ${vi} | ${IV} | ${V} |`
		: `| ${I} ${vi} | ${IV} ${V} | ${I} ${vi} | ${IV} ${V} |`;
}
