import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** The chords the browser detected, one segment per run of bars. */
export const ChordSegmentSchema = v.object({
	bar: v.pipe(v.number(), v.integer(), v.minValue(1)),
	bars: v.pipe(v.number(), v.integer(), v.minValue(1)),
	chord: v.pipe(v.string(), v.trim(), v.maxLength(12)),
});

/** What the transcriber heard in one bar, as text the model reads (lowest to highest, pitch+octave × seconds @ loudness). */
export const BarNotesSchema = v.object({
	bar: v.pipe(v.number(), v.integer(), v.minValue(1)),
	notes: v.pipe(v.string(), v.maxLength(2000)),
});

export const ChartDraftSchema = v.object({
	id: NanoIdSchema,
	/** The template matcher's chords, as a hint. */
	chords: v.pipe(v.array(ChordSegmentSchema), v.minLength(1), v.maxLength(1000)),
	/** The notes per bar, which the model reads like a chart reader would. */
	bars: v.pipe(v.array(BarNotesSchema), v.minLength(1), v.maxLength(1000)),
});

/** Saving a drafted chart; `replace` confirms overwriting one that has content. */
export const ChartSaveSchema = v.object({
	id: NanoIdSchema,
	markdown: v.pipe(v.string(), v.maxLength(200_000)),
	replace: v.optional(v.boolean(), false),
});

/** What the model must return. */
export const ChartDraftAnswerSchema = v.object({
	/** One chord per bar, in order, space-separated: "D5 D5 A5 % G5" ("%" repeats, "N.C." for silence). */
	chords: v.pipe(v.string(), v.trim(), v.maxLength(12_000)),
	sections: v.pipe(
		v.array(
			v.object({
				index: v.pipe(v.string(), v.trim(), v.maxLength(8)),
				name: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40)),
				bar: v.pipe(v.number(), v.integer(), v.minValue(1)),
			}),
		),
		v.maxLength(64),
	),
	progressions: v.array(
		v.object({
			section: v.pipe(v.string(), v.trim(), v.maxLength(40)),
			chords: v.pipe(v.string(), v.trim(), v.maxLength(400)),
		}),
	),
	chart: v.pipe(v.string(), v.maxLength(20_000)),
	notes: v.optional(v.pipe(v.string(), v.maxLength(400)), ""),
});
export type ChartDraftAnswer = v.InferOutput<typeof ChartDraftAnswerSchema>;
export type ChordSegmentInput = v.InferOutput<typeof ChordSegmentSchema>;
export type BarNotesInput = v.InferOutput<typeof BarNotesSchema>;
