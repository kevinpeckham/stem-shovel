/**
 * How a take was encoded, as the browser reported it at reservation
 * (`recording.codec`), so a player can ask `canPlayType` about the original
 * before falling back to the MP3 rendition (src/lib/utils/playbackMime.ts).
 * "flac" is what the jobs function turns Chrome's raw "pcm" into.
 */
export const RECORDING_CODECS = ["alac", "pcm", "flac", "opus", "aac"] as const;
export type RecordingCodec = (typeof RECORDING_CODECS)[number];
