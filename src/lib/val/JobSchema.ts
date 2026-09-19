import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** The background jobs the app hands to its own jobs function (src/lib/server/jobs.ts). */
export const JOB_KINDS = [
	"mix",
	"notes",
	"stem-playback",
	"demo-playback",
	"recording-playback",
] as const;

export type JobKind = (typeof JOB_KINDS)[number];

export const JobSchema = v.object({
	kind: v.picklist(JOB_KINDS),
	ids: v.pipe(v.array(NanoIdSchema), v.minLength(1), v.maxLength(200)),
});

export type Job = v.InferOutput<typeof JobSchema>;
