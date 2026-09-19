export type RecordingQuality = "lossless" | "compressed";

export interface RecordingFormat {
	mimeType: string;
	/** The file extension the server expects for it (src/lib/constants/demoFormats.ts). */
	ext: string;
	/** A short codec name for the format line under the meter. */
	codec: "ALAC" | "PCM" | "Opus" | "AAC";
	lossless: boolean;
}

/**
 * What the browser's MediaRecorder should write. Lossless where it can:
 * Safari 18.4+ records ALAC (or raw PCM) in MP4, Chrome and Edge 135+ raw
 * PCM in WebM (the jobs function turns that into FLAC); otherwise Opus in
 * WebM (Chrome, Firefox) or AAC in MP4 (older Safari). The first supported
 * candidate wins; `null` when nothing works (an old browser). "compressed"
 * skips the lossless candidates, for a metered connection.
 */
const LOSSLESS: RecordingFormat[] = [
	{ mimeType: "audio/mp4; codecs=alac", ext: "m4a", codec: "ALAC", lossless: true },
	{ mimeType: "audio/webm;codecs=pcm", ext: "webm", codec: "PCM", lossless: true },
	{ mimeType: "audio/mp4; codecs=pcm", ext: "m4a", codec: "PCM", lossless: true },
];
const COMPRESSED: RecordingFormat[] = [
	{ mimeType: "audio/webm;codecs=opus", ext: "webm", codec: "Opus", lossless: false },
	{ mimeType: "audio/mp4", ext: "m4a", codec: "AAC", lossless: false },
	{ mimeType: "audio/webm", ext: "webm", codec: "Opus", lossless: false },
	{ mimeType: "audio/ogg;codecs=opus", ext: "ogg", codec: "Opus", lossless: false },
];

export function recordingMimeType(
	isTypeSupported: (type: string) => boolean,
	quality: RecordingQuality = "lossless",
): RecordingFormat | null {
	const ladder = quality === "lossless" ? [...LOSSLESS, ...COMPRESSED] : COMPRESSED;
	return ladder.find((c) => isTypeSupported(c.mimeType)) ?? null;
}
