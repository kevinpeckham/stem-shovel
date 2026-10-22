import { clipLaneEvents } from "#lib/utils/clipLaneEvents.js";
import { clipNoteEvents } from "#lib/utils/clipNoteEvents.js";
import { swingNotes } from "#lib/utils/swingNotes.js";
import type { StudioClip, StudioTrack } from "#lib/val/StudioSchema.js";
import { isInstrument } from "#lib/constants/studioInstruments.js";
import { INSTRUMENTS } from "./instruments";
import type { BarGrid } from "./measures";

/**
 * A MIDI track's clips played offline (docs/dawn-daw-plan.md, D3): the
 * notes through the track's feel (D5), then the track's instrument
 * renders them on the offline context (instruments.ts), so a bounce needs
 * no real-time pass through the speakers. Everything lands in `into`,
 * the track's strip.
 */
export async function renderMidiClipsOffline(
	off: OfflineAudioContext,
	into: AudioNode,
	track: StudioTrack,
	clips: StudioClip[],
	bpm: number,
	feel?: { grid: BarGrid; swing?: number; humanize?: number },
): Promise<void> {
	const source = track.input?.source;
	if (!source || !isInstrument(source)) return;
	const flat = clips.flatMap((c) => clipNoteEvents(c));
	const events = feel ? swingNotes(flat, feel) : flat;
	if (events.length === 0) return;
	const controls = clips.flatMap((c) => clipLaneEvents(c));
	await INSTRUMENTS[source].renderOffline(off, into, events, bpm, track, controls);
}
