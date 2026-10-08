import { FADER_MAX } from "./fader";
import { MAX_TAKE_SECONDS } from "./takeLimits";

/**
 * Ceilings on a Studio song (docs/multitrack-recorder.md): decoded audio is
 * what binds (a mono minute at 48 kHz is 11.5 MB of float samples), so the
 * caps keep a song inside what a laptop's tab holds, and the arrangement
 * JSON stays small enough to snapshot on every edit.
 */

/** Tracks a song may hold. */
export const MAX_STUDIO_TRACKS = 16;
/** Clips across every track. */
export const MAX_STUDIO_CLIPS = 400;
/** Audio files (takes and imports) a song may keep. */
export const MAX_STUDIO_SOURCES = 64;
/** A recording stops at this length, as a take does. */
export const MAX_STUDIO_SECONDS = MAX_TAKE_SECONDS;
/** Notes a MIDI clip may hold (phase 3): a dense piano part runs to a few hundred a minute. */
export const MAX_STUDIO_NOTES_PER_CLIP = 2000;
/** Autosaved revisions kept per song; named ones are kept for good. */
export const STUDIO_AUTOSAVES_KEPT = 10;
/** A track's fader, as the stem player's. */
export const STUDIO_FADER_MAX = FADER_MAX;
/** Decoded audio past which the device warns (bytes). */
export const STUDIO_MEMORY_WARNING_BYTES = 400 * 1024 * 1024;
