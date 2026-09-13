import { SUBFRAMES } from "$lib/constants/frameRates";

/** "mm:ss:ff.sub" (or with hours) → seconds; null if not timecode. */
export function parseTimecode(text: string, fps: number): number | null {
	const m = text.trim().match(/^(?:(\d+):)?(\d{1,2}):(\d{1,2}):(\d{1,2})(?:\.(\d{1,2}))?$/);
	if (!m) return null;
	const [, h = "0", mm, ss, ff, sub = "0"] = m;
	if (
		Number(mm) >= 60 ||
		Number(ss) >= 60 ||
		Number(ff) >= Math.ceil(fps) ||
		Number(sub) >= SUBFRAMES
	) {
		return null;
	}
	return (
		Number(h) * 3600 + Number(mm) * 60 + Number(ss) + (Number(ff) + Number(sub) / SUBFRAMES) / fps
	);
}
