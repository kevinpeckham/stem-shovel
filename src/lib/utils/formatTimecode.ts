import { SUBFRAMES } from "$lib/constants/frameRates";

/**
 * Logic's timecode: [hh:]mm:ss:ff.sub — frames at the song's frame rate and
 * subframes (80 per frame). "02:03:15.72" is 2 min 3 s 15 frames 72 subframes.
 */
export function formatTimecode(seconds: number, fps: number): string {
	const total = Math.max(0, seconds);
	const whole = Math.floor(total + 1e-9);
	const frames = (total - whole) * fps;
	const ff = Math.floor(frames + 1e-6);
	const sub = Math.floor((frames - ff) * SUBFRAMES + 1e-6);
	const h = Math.floor(whole / 3600);
	const m = Math.floor((whole % 3600) / 60);
	const sec = whole % 60;
	const pad = (n: number) => String(n).padStart(2, "0");
	return `${h ? `${pad(h)}:` : ""}${pad(m)}:${pad(sec)}:${pad(ff)}.${pad(sub)}`;
}
