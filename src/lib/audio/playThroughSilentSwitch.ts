import { audioSession } from "$lib/utils/audioSession";
import { isIOS } from "$lib/utils/isIOS";

/**
 * iOS silences the Web Audio API under the ring/silent switch but lets media
 * elements play, like a music app. Asks for the media rules before the stem
 * engine plays: the AudioSession API (Safari 17+), and, where it is missing,
 * the older trick of a silent looping <audio> element started on the same
 * user gesture, which moves Web Audio onto the media channel. Call from the
 * gesture that starts playback; a no-op off iOS. The session type is set on
 * every call, since the recorder switches it to "play-and-record" for the
 * microphone (WebKit refuses to capture under "playback") and a later play
 * needs it back.
 */
const SILENT_WAV =
	"data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA";

let done = false;
let keepAlive: HTMLAudioElement | null = null;

export function playThroughSilentSwitch(): void {
	if (typeof document === "undefined" || !isIOS()) return;
	const session = audioSession();
	if (session) {
		session.type = "playback";
		return;
	}
	if (done) return;
	done = true;
	const el = document.createElement("audio");
	el.src = SILENT_WAV;
	el.loop = true;
	el.setAttribute("playsinline", "");
	el.setAttribute("aria-hidden", "true");
	el.style.display = "none";
	document.body.append(el);
	keepAlive = el;
	void el.play().catch(() => {
		// Not from a user gesture after all: the next call may do it.
		el.remove();
		keepAlive = null;
		done = false;
	});
}

/** For tests: forget what was done. */
export function resetPlayThroughSilentSwitch(): void {
	keepAlive?.remove();
	keepAlive = null;
	done = false;
}
