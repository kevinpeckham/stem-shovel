import * as v from "valibot";
import { ChartSourceSchema } from "./ChartSourceSchema";
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

/** The chords the browser detected and the notes per bar, for the AI's chord check (`reconcileChords`). */
export const ChordsCheckSchema = v.object({
	id: NanoIdSchema,
	/** The template matcher's chords, as a hint. */
	chords: v.pipe(v.array(ChordSegmentSchema), v.minLength(1), v.maxLength(1000)),
	/**
	 * The notes per bar, which the model reads like a chart reader would; empty
	 * when the chords came from the chord model before the stems were transcribed.
	 */
	bars: v.pipe(v.array(BarNotesSchema), v.minLength(0), v.maxLength(1000)),
	/** Where the chords came from: the notes' template matcher, or the chord model that read the mix (docs/audio-engine.md "The chord model"). */
	source: v.optional(v.picklist(["matcher", "model"]), "matcher"),
});

/**
 * Drafting a chart: the chord check's input plus `grid`, the bar starts in
 * seconds the browser voted the chords on and where the last bar ends
 * (`@barmark/sync`'s bar grid; up to 2000 bars), which the server builds the
 * starting chart and its timing map on (src/lib/server/chartBuild.ts).
 */
export const ChartDraftSchema = v.object({
	...ChordsCheckSchema.entries,
	grid: v.pipe(
		v.array(v.pipe(v.number(), v.finite(), v.minValue(0))),
		v.minLength(2),
		v.maxLength(2001),
	),
});

/** Saving a drafted chart; `replace` confirms overwriting one that has content. */
export const ChartSaveSchema = v.object({
	id: NanoIdSchema,
	markdown: v.pipe(v.string(), v.maxLength(200_000)),
	replace: v.optional(v.boolean(), false),
	/** The draft's timing map and confidence (@barmark/sync), checked against the saved chart on the server, not here. */
	timing: v.optional(v.unknown()),
	confidence: v.optional(v.unknown()),
	/** Where the draft came from (a score file or the stems), kept as the chart's source; absent for a chart of the member's own. */
	source: v.optional(ChartSourceSchema),
});

/** A timing map for the song's own chart, from the chart aligned to the stems; checked on the server. */
export const ChartTimingSaveSchema = v.object({
	id: NanoIdSchema,
	timing: v.unknown(),
});

/** Whether the player follows the song's chart timing map (`setChartTimingUse`). */
export const ChartTimingUseSchema = v.object({
	id: NanoIdSchema,
	use: v.boolean(),
});

/** What the model must return. */
export const ChartDraftAnswerSchema = v.object({
	/** One chord per bar, in order, space-separated: "D5 D5 A5 % G5" ("%" repeats, "N.C." for silence). */
	chords: v.pipe(v.string(), v.trim(), v.maxLength(12_000)),
	sections: v.pipe(
		v.array(
			v.object({
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
