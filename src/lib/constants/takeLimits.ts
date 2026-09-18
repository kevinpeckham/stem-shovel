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
/** Asked of MediaRecorder; Chrome and Firefox honour it, Safari picks its own AAC rate. */
export const RECORDING_BITS_PER_SECOND = 128_000;
/** The file limit: the time limit at twice the asked bitrate, rounded up. */
export const MAX_TAKE_BYTES = 32 * 1024 * 1024;
