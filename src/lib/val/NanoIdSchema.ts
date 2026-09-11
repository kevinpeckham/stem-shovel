import * as v from "valibot";

/** Primary keys are app-generated nanoids (see db/schema/columns.ts). */
export const NanoIdSchema = v.pipe(v.string(), v.nonEmpty(), v.nanoid("Not a valid id."));

export type NanoId = v.InferOutput<typeof NanoIdSchema>;
