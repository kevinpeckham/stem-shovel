import * as v from "valibot";
import { ArrangementRefSchema } from "./ArrangementSchema";
import { NanoIdSchema } from "./NanoIdSchema";

/** The chartless placement made the song's grid (`useChartlessGrid`): its start of bar 1 in seconds and its tempo, for Main or an alternate. */
export const ChartlessGridUseSchema = v.object({
	id: NanoIdSchema,
	startAt: v.pipe(v.number(), v.finite(), v.minValue(0)),
	bpm: v.pipe(v.number(), v.finite(), v.minValue(20), v.maxValue(400)),
	/** The arrangement shown: null (or absent) for Main, the song's own. */
	arrangementId: ArrangementRefSchema,
});

export type ChartlessGridUse = v.InferOutput<typeof ChartlessGridUseSchema>;
