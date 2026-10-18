/**
 * Loudness targets for an export (docs/dawn-daw-plan.md, D3): the
 * streaming services' common reference, Spotify's among them, so a mix
 * normalized here plays at the level they would set anyway.
 */
export const LOUDNESS_TARGET_LUFS = -14;
export const TRUE_PEAK_CEILING_DBTP = -1;
/** Below this a block of audio counts as silence and never enters the measurement (ITU-R BS.1770's absolute gate). */
export const LOUDNESS_ABSOLUTE_GATE_LUFS = -70;
