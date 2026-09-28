import * as v from "valibot";
import { DRUM_METER_IDS, DRUM_STEP_CHOICES, DRUM_VOICE_IDS } from "$lib/constants/drumMachine";

/** What the drum machine asks for: a description, and the shape of the open pattern the answer must fit. */
export const TextToBeatSchema = v.object({
	prompt: v.pipe(v.string(), v.trim(), v.minLength(2), v.maxLength(300)),
	meter: v.picklist(DRUM_METER_IDS),
	steps: v.picklist(DRUM_STEP_CHOICES),
	/** The voices the open pattern has, so the model can prefer them. */
	voices: v.optional(v.pipe(v.array(v.picklist(DRUM_VOICE_IDS)), v.maxLength(12)), []),
});
export type TextToBeatInput = v.InferOutput<typeof TextToBeatSchema>;

/** What the model is asked to reply, in the presets' row-string form (`.` rest, `o` ghost, `x` hit, `X` accent). */
export const TextToBeatReplySchema = v.object({
	bpm: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(40), v.maxValue(240)))),
	/** A percentage: models think of swing that way. */
	swing: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100)))),
	note: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(200)))),
	rows: v.pipe(
		v.array(
			v.object({
				voice: v.picklist(DRUM_VOICE_IDS),
				cells: v.pipe(v.string(), v.regex(/^[.oxX]+$/, "cells must be . o x X only")),
			}),
		),
		v.minLength(1),
		v.maxLength(12),
	),
});
export type TextToBeatReply = v.InferOutput<typeof TextToBeatReplySchema>;
