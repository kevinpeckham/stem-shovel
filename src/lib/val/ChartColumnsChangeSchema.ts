import * as v from "valibot";
import { ChartColumnsSchema } from "./ChartColumnsSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** How the song's chart sizes its columns (`setChartColumns`, the Chart panel's ⋯ menu). */
export const ChartColumnsChangeSchema = v.object({
	id: NanoIdSchema,
	columns: ChartColumnsSchema,
});
export type ChartColumnsChange = v.InferOutput<typeof ChartColumnsChangeSchema>;
