import * as v from "valibot";

/** Lifecycle of a stem's playback rendition; null in the database = not attempted. */
export const PLAYBACK_STATUSES = ["pending", "ready", "failed"] as const;

export const PlaybackStatusSchema = v.picklist(PLAYBACK_STATUSES);

export type PlaybackStatus = v.InferOutput<typeof PlaybackStatusSchema>;
