// uploading: row reserved, bytes in flight. ready: decoded and reported. failed: gave up.
import * as v from "valibot";

export const STEM_STATUSES = ["uploading", "ready", "failed"] as const;

export const StemStatusSchema = v.picklist(STEM_STATUSES);

export type StemStatus = v.InferOutput<typeof StemStatusSchema>;
