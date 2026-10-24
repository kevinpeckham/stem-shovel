import { DELAY_TIME_MAX, DELAY_TIME_MIN } from "#lib/constants/studioInserts.js";
import type { StudioInsert } from "#lib/val/StudioSchema.js";

/** A synced delay's time in seconds: `beats` of the song at `bpm`, kept within the delay's range. */
export function delaySyncSeconds(beats: number, bpm: number): number {
	const seconds = (60 / Math.max(1, bpm)) * beats;
	return Math.min(DELAY_TIME_MAX, Math.max(DELAY_TIME_MIN, seconds));
}

/**
 * Inserts as a strip should hear them at a tempo (docs/multitrack-recorder.md
 * "Pre-fader sends and a tempo-synced delay"): a delay whose `sync` names a
 * note value gets its `time` from the tempo; the rest pass through untouched.
 */
export function withSyncedDelays(inserts: StudioInsert[], bpm: number): StudioInsert[] {
	return inserts.map((i) => {
		const sync = i.kind === "delay" && typeof i.settings.sync === "number" ? i.settings.sync : 0;
		return sync > 0 ? { ...i, settings: { ...i.settings, time: delaySyncSeconds(sync, bpm) } } : i;
	});
}
