/**
 * The player's Auto EQ for session recordings (docs/uploads-and-blob.md,
 * "Auto EQ"; Kevin, 2026-10-26): a recording's long-term level per octave
 * band, measured when its MP3 is made (`session_recording.spectrum`), is
 * compared with the curve of a well-mixed live recording and the five
 * bands of the playback EQ are set to close the gap. Pressed by the user,
 * never applied on its own, and every slider stays free afterward.
 */

/** The octave bands' centers, Hz, in the order the spectrum stores them. */
export const SPECTRUM_BANDS = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

/**
 * The target: octave-band levels of a well-mixed live recording, dB
 * relative to the 125 Hz band. Flat through the low mids, then falling
 * about 3 dB an octave from 1 kHz, with the lowest octave down (a phone's
 * capture has rumble there, a mix does not). Tuned by ear against
 * Kevin's shows; the shape matters, not the absolute numbers, since the
 * fit aligns the two curves over `AUTO_EQ_ALIGN_BANDS` first.
 */
export const LIVE_TARGET_DB = [-6, -1, 0, 0, -1, -2.5, -5, -8, -12, -18] as const;

/** The bands (indices into SPECTRUM_BANDS: 125 Hz to 4 kHz) over which the measured curve is aligned with the target before the gap is read. */
export const AUTO_EQ_ALIGN_BANDS = [2, 7] as const;

/** The most a fitted band gets, dB either way: the EQ allows 12, but a fit past this is the recording's fault, not the room's. */
export const AUTO_EQ_MAX_DB = 8;

/** A measured low octave this much above the target (dB) turns the 80 Hz high-pass on: rumble, not bass. */
export const AUTO_EQ_RUMBLE_DB = 3;
