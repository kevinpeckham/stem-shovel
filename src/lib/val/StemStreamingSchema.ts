import * as v from "valibot";

/**
 * How the site streams stems (docs/stem-streaming.md): "auto" streams a song
 * only when its decoded size passes the listener's device budget, "always"
 * streams every song where the browser can. An app setting a system admin
 * sets on /admin/playback; the song page hands it to the player.
 */
export const STEM_STREAMING_SETTINGS = ["auto", "always"] as const;

export const StemStreamingSchema = v.picklist(STEM_STREAMING_SETTINGS);

export type StemStreaming = v.InferOutput<typeof StemStreamingSchema>;

/** The admin form. */
export const StemStreamingFormSchema = v.object({ mode: StemStreamingSchema });
