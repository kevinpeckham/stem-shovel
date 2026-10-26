import {
	EQ_BAND_SPECS,
	EQ_BANDS,
	PLAYBACK_EQ_MAX_DB,
	PLAYBACK_EQ_MIN_DB,
} from "#lib/constants/playbackEq.js";
import * as v from "valibot";

/** One band: its gain in dB and its center (or shelf corner) in Hz. The band's own range is applied by `normalizePlaybackEq`. */
export const EqBandSettingsSchema = v.object({
	gain: v.pipe(v.number(), v.minValue(PLAYBACK_EQ_MIN_DB), v.maxValue(PLAYBACK_EQ_MAX_DB)),
	freq: v.pipe(v.number(), v.minValue(20), v.maxValue(20000)),
});
export type EqBandSettings = v.InferOutput<typeof EqBandSettingsSchema>;

/**
 * The playback EQ's settings (constants/playbackEq.ts): the high-pass
 * switch and the five bands. Saved per session on the device
 * (`utils/playbackEqStorage.ts`), on the session row for everyone in the
 * account (`recording_session.eq`, JSON) and carried by the download's
 * query (`utils/eqSearchParams.ts`).
 */
export const PlaybackEqSchema = v.object({
	highPass: v.boolean(),
	low: EqBandSettingsSchema,
	lowMid: EqBandSettingsSchema,
	mid: EqBandSettingsSchema,
	highMid: EqBandSettingsSchema,
	high: EqBandSettingsSchema,
});
export type PlaybackEqSettings = v.InferOutput<typeof PlaybackEqSchema>;

/** Everything flat at the default centers: the sound as it is. */
export const DEFAULT_PLAYBACK_EQ: Readonly<PlaybackEqSettings> = Object.freeze(
	Object.fromEntries([
		["highPass", false],
		...EQ_BANDS.map((b) => [b, Object.freeze({ gain: 0, freq: EQ_BAND_SPECS[b].defaultFreq })]),
	]) as PlaybackEqSettings,
);
