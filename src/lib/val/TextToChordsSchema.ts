import * as v from "valibot";
import { AUTO_STRUM_PATTERNS, AUTO_STRUM_SPEEDS } from "#lib/constants/autoStrum.js";
import { CHORD_STYLES } from "#lib/constants/chordStyles.js";
import { CHORD_VOICINGS, STRUMS } from "#lib/constants/circleOfFifths.js";
import { PIANO_INSTRUMENT_IDS } from "#lib/constants/piano.js";

/** What the chord player asks for: a description, the meter the pad is in, the key the circle is turned to and the style on, for the model's context. */
export const TextToChordsSchema = v.object({
	prompt: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(300)),
	beatsPerBar: v.picklist([3, 4]),
	/** The circle's key as its position (0 = C, 1 = G … 11 = F). */
	key: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(11)),
	style: v.pipe(v.string(), v.maxLength(48)),
});
export type TextToChordsInput = v.InferOutput<typeof TextToChordsSchema>;

/** The circle's keys by position (0 = C, 1 = G … 11 = F), as the prompt names the player's. */
export const KEY_NAMES = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"] as const;

const percent = v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100))));
/** How the model may set the player up for its progression (Kevin: anything a preset holds): each field optional, the player keeping what it has for the rest. */
export const TextToChordsSetupSchema = v.object({
	mode: v.optional(v.nullable(v.picklist(["chords", "notes"]))),
	sound: v.optional(v.nullable(v.picklist(PIANO_INSTRUMENT_IDS))),
	voicing: v.optional(v.nullable(v.picklist(CHORD_VOICINGS.map((c) => c.id)))),
	strum: v.optional(v.nullable(v.picklist(STRUMS.map((s) => s.id)))),
	strumDirection: v.optional(v.nullable(v.picklist(["down", "up", "alternate"]))),
	strumPattern: v.optional(v.nullable(v.picklist(AUTO_STRUM_PATTERNS.map((p) => p.id)))),
	strumSpeed: v.optional(v.nullable(v.picklist(AUTO_STRUM_SPEEDS.map((s) => s.id)))),
	arp: v.optional(
		v.nullable(
			v.object({
				on: v.boolean(),
				rate: v.optional(v.nullable(v.picklist(["4", "8", "8t", "16"]))),
				pattern: v.optional(v.nullable(v.picklist(["up", "down", "updown", "played", "random"]))),
				octaves: v.optional(
					v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(3))),
				),
				/** A percentage: how much of each step the note sounds. */
				gate: v.optional(v.nullable(v.pipe(v.number(), v.minValue(10), v.maxValue(100)))),
				latch: v.optional(v.nullable(v.boolean())),
				swing: percent,
				ratio: v.optional(v.nullable(v.picklist([0.5, 1, 2]))),
			}),
		),
	),
	octave: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(2), v.maxValue(6)))),
	sustain: v.optional(v.nullable(v.boolean())),
	/** Percentages, as Text-to-Beat's. */
	effects: v.optional(
		v.nullable(v.object({ reverb: percent, reverbSize: percent, delay: percent, chorus: percent })),
	),
});
export type TextToChordsSetup = v.InferOutput<typeof TextToChordsSetupSchema>;

/** What the model is asked to reply: the progression as a barmark chord chart (its key, meter, tempo and feel in its directives), and a name, a note and a style if it has an opinion, and a setup for the player. */
export const TextToChordsReplySchema = v.object({
	setup: v.optional(v.nullable(TextToChordsSetupSchema)),
	name: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(40)))),
	note: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)))),
	style: v.optional(v.nullable(v.picklist(CHORD_STYLES.map((s) => s.id)))),
	chart: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4000)),
});
export type TextToChordsReply = v.InferOutput<typeof TextToChordsReplySchema>;
