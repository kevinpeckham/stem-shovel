import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/**
 * "Chart from score" (files.remote.ts `chartFromScore`): the notation file,
 * and for a score without chord symbols the part whose notes to chart as note
 * sets (its name, abbreviation or id, any case, as @barmark/musicxml takes it).
 */
export const ChartFromScoreSchema = v.object({
	id: NanoIdSchema,
	part: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(80))),
});
export type ChartFromScore = v.InferOutput<typeof ChartFromScoreSchema>;
