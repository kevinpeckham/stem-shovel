import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** Where a chart came from when it was not written by hand: a score file read by the model or imported, or the stems. */
export const CHART_SOURCE_KINDS = ["notation", "file", "stems"] as const;

/**
 * The song's chart's provenance (`song.chart_source`, docs/audio-engine.md
 * "Where a chart came from"): the score file it was read or imported from
 * (`notation` is a MusicXML in `song_notation`, `file` a PDF or image in
 * `song_pdf`), or `stems` for "Generate chart from the stems". The name is
 * a snapshot, so the line still reads after the file is deleted; `at` is
 * when the chart was saved from it. Cleared by a save that does not name
 * a source (a hand edit keeps the chart as the member's own).
 */
export const ChartSourceSchema = v.object({
	kind: v.picklist(CHART_SOURCE_KINDS),
	/** The file's id; absent for the stems. */
	id: v.optional(NanoIdSchema),
	/** The file's name as it was, for the line; absent for the stems. */
	name: v.optional(v.pipe(v.string(), v.maxLength(300))),
	/** When the chart was saved from it, ISO 8601. */
	at: v.pipe(v.string(), v.isoTimestamp()),
});
export type ChartSource = v.InferOutput<typeof ChartSourceSchema>;
