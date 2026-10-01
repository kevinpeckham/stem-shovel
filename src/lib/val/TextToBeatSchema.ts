import * as v from "valibot";
import {
	DRUM_DELAY_TIMES,
	DRUM_METER_IDS,
	DRUM_STEP_CHOICES,
	DRUM_VOICE_IDS,
} from "$lib/constants/drumMachine";

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
	/** The kit the beat is written for; the model chooses between the two settled ones. */
	kit: v.optional(v.nullable(v.picklist(["acoustic", "electronic"]))),
	/** A percentage too: 0 machine-exact, 15 to 30 a human looseness. */
	humanize: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100)))),
	/** Effects the description asked for, as percentages, and the delay's time by its menu label; absent means a dry beat. */
	fx: v.optional(
		v.nullable(
			v.object({
				reverb: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100)))),
				delay: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100)))),
				delayTime: v.optional(v.nullable(v.picklist(DRUM_DELAY_TIMES.map((d) => d.label)))),
				fuzz: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100)))),
				wah: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100)))),
				/** Tone: tilt -100 dark to 100 bright, air and bottom as percentages. */
				tilt: v.optional(v.nullable(v.pipe(v.number(), v.minValue(-100), v.maxValue(100)))),
				air: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100)))),
				bottom: v.optional(v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(100)))),
			}),
		),
	),
	rows: v.pipe(
		v.array(
			v.object({
				voice: v.picklist(DRUM_VOICE_IDS),
				cells: v.pipe(v.string(), v.regex(/^[.oxX]+$/, "cells must be . o x X only")),
				/** -100 left to 100 right; absent, the drum's usual place. */
				pan: v.optional(v.nullable(v.pipe(v.number(), v.minValue(-100), v.maxValue(100)))),
			}),
		),
		v.minLength(1),
		v.maxLength(12),
	),
});
export type TextToBeatReply = v.InferOutput<typeof TextToBeatReplySchema>;
