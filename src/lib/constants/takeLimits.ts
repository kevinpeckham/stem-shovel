/**
 * Ceilings on a take in the Idea Recorder, so a recorder left running does
 * not fill the Blob store with silence: the browser stops the take at the
 * time limit or after a stretch of silence, and the server refuses a file
 * over the byte limit (the reservation and the upload token).
 */

/** A take stops and saves at this length. */
export const MAX_TAKE_SECONDS = 15 * 60;
/** A notice appears at this length, ahead of the stop. */
export const TAKE_WARNING_SECONDS = 10 * 60;
/** Input below `SILENCE_LEVEL` for this long stops the take (discarded when it was never louder). */
export const SILENCE_STOP_SECONDS = 2 * 60;
/** The meter's 0..1 level (RMS × 3) under which the input counts as silence: about -50 dBFS. */
export const SILENCE_LEVEL = 0.01;
/** Asked of MediaRecorder for a compressed take; Chrome and Firefox honour it, Safari picks its own AAC rate. */
export const RECORDING_BITS_PER_SECOND = 256_000;
/**
 * The file limit: a lossless stereo take at 48 kHz runs about 6 MB a minute
 * as ALAC and 11.5 MB as raw PCM (Chrome, before the jobs function turns it
 * into FLAC), so the time limit needs about 175 MB at the very worst; 120 MB
 * covers ALAC stereo and PCM mono with room, and a compressed take never
 * comes near it.
 */
export const MAX_TAKE_BYTES = 120 * 1024 * 1024;
