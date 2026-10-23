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
/** Markers on the ruler (D4). */
export const MAX_STUDIO_MARKERS = 64;
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
/**
 * The rates a song may be rendered at (Song settings, docs/multitrack-recorder.md
 * "Sample rates"): the mix, the stems and the project files come out at the
 * song's rate on every machine, whatever rate the device records at.
 */
export const STUDIO_SAMPLE_RATES = [44100, 48000, 88200, 96000] as const;
/** A song that names no rate renders at this one. */
export const STUDIO_SAMPLE_RATE_DEFAULT = 48000;
/**
 * A clip's warp (docs/multitrack-recorder.md "Warping a clip"): points
 * mapping the clip's content seconds to the file's. A loop fitted to a
 * tempo is two; a Live set's beat-by-beat markers run to a few hundred.
 */
export const MAX_STUDIO_WARP_POINTS = 512;
/**
 * The note a beat of the bar can be (the time signature's bottom number;
 * docs/multitrack-recorder.md "Time-signature denominators"): 6/8 is six
 * eighths a bar. The tempo stays in quarter notes a minute, as every DAW
 * and the MIDI file count it.
 */
export const BEAT_UNITS = [2, 4, 8, 16] as const;
/** How far a clip can be stretched or squeezed by hand: a quarter to four times its length (the WSOLA's comfortable range). */
export const WARP_RATIO_MIN = 0.25;
export const WARP_RATIO_MAX = 4;
