import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** The longest read a member may save; a six-page score reads to a few thousand characters. */
export const MAX_CHART_READ_CHARS = 20_000;

/** A read has a line per measure, `m1 …`, `m2 …` (the form `readChartWithAi` asks for). */
export const CHART_READ_MEASURE_LINE = /^m\d+/m;

/**
 * A member's correction of a score's read (docs/audio-engine.md, "The chart
 * read is stored"): the score file and the whole read as text, trimmed.
 */
export const ChartReadSaveSchema = v.object({
	id: NanoIdSchema,
	text: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty("The read is empty."),
		v.maxLength(MAX_CHART_READ_CHARS, "Keep the read under 20,000 characters."),
	),
});
export type ChartReadSave = v.InferOutput<typeof ChartReadSaveSchema>;
