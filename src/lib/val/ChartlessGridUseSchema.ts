import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** The chartless placement made the song's grid (`useChartlessGrid`): its start of bar 1 in seconds and its tempo. */
export const ChartlessGridUseSchema = v.object({
	id: NanoIdSchema,
	startAt: v.pipe(v.number(), v.finite(), v.minValue(0)),
	bpm: v.pipe(v.number(), v.finite(), v.minValue(20), v.maxValue(400)),
});

export type ChartlessGridUse = v.InferOutput<typeof ChartlessGridUseSchema>;
