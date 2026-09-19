/**
 * The page's AudioSession (Safari 17+; the W3C Audio Session API), or null
 * where the browser has none. WebKit lets a page capture the microphone only
 * under the "auto" and "play-and-record" categories and plays Web Audio
 * through the iOS ring/silent switch only under "playback" or
 * "play-and-record", so the stem player and the recorder each set what they
 * need before they start (docs/audio-engine.md).
 */
export function audioSession(): { type: string } | null {
	if (typeof navigator === "undefined") return null;
	const nav = navigator as Navigator & { audioSession?: { type: string } };
	return nav.audioSession ?? null;
}
