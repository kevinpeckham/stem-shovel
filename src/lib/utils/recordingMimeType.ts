/**
 * The container the browser's MediaRecorder should write, and the file
 * extension the server expects for it (src/lib/constants/demoFormats.ts):
 * Safari records AAC in MP4, Chrome and Firefox Opus in WebM. The first
 * supported candidate wins; `null` when nothing works (an old browser).
 */
const CANDIDATES: { mimeType: string; ext: string }[] = [
	{ mimeType: "audio/mp4", ext: "m4a" },
	{ mimeType: "audio/webm;codecs=opus", ext: "webm" },
	{ mimeType: "audio/webm", ext: "webm" },
	{ mimeType: "audio/ogg;codecs=opus", ext: "ogg" },
];

export function recordingMimeType(
	isTypeSupported: (type: string) => boolean,
): { mimeType: string; ext: string } | null {
	return CANDIDATES.find((c) => isTypeSupported(c.mimeType)) ?? null;
}
