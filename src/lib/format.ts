/** 83.4 → "1:23.4" */
export function formatTime(seconds: number, decimals = 1): string {
	const s = Math.max(0, seconds);
	const m = Math.floor(s / 60);
	const rest = (s - m * 60).toFixed(decimals).padStart(3 + decimals, "0");
	return `${m}:${rest}`;
}

/** 10485760 → "10.0 MB" */
export function formatBytes(bytes: number): string {
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** "2024-03-09" → "March 2024" (a day is more than a songwriting date usually needs). */
export function formatMonth(isoDate: string): string {
	const [y, m] = isoDate.split("-").map(Number);
	if (!y || !m) return isoDate;
	return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Parses a time the way the transport shows it — "1:23.4", "1:23", "83.4",
 * "83", "1:02:03.4" — into seconds. null when it is not a time.
 */
export function parseTime(text: string): number | null {
	const parts = text.trim().split(":");
	if (parts.length === 0 || parts.length > 3 || parts.some((p) => !/^\d+(\.\d+)?$/.test(p))) {
		return null;
	}
	const nums = parts.map(Number);
	if (nums.slice(1).some((n) => n >= 60)) return null;
	return nums.reduce((total, n) => total * 60 + n, 0);
}

/** 1 → "I", 4 → "IV", 12 → "XII"; the default index of a new song section. */
export function toRoman(n: number): string {
	if (!Number.isInteger(n) || n <= 0 || n >= 4000) return String(n);
	const table: [number, string][] = [
		[1000, "M"],
		[900, "CM"],
		[500, "D"],
		[400, "CD"],
		[100, "C"],
		[90, "XC"],
		[50, "L"],
		[40, "XL"],
		[10, "X"],
		[9, "IX"],
		[5, "V"],
		[4, "IV"],
		[1, "I"],
	];
	let out = "";
	for (const [value, glyph] of table)
		while (n >= value) {
			out += glyph;
			n -= value;
		}
	return out;
}

/** Frame rates a song can be set to (Logic's list, minus drop-frame). */
export const FRAME_RATES = [23.976, 24, 25, 29.97, 30] as const;
export type FrameRate = (typeof FRAME_RATES)[number];
/** Logic divides a frame into 80 subframes. */
export const SUBFRAMES = 80;

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

/** "12|3" or "12|3|0.5" — bar, beat and a fraction of the beat; null if not bars. */
export function parseBarsText(
	text: string,
): { bar: number; beat: number; fraction: number } | null {
	const m = text.trim().match(/^(-?\d+)\|(\d+)(?:\|(\d*\.?\d+))?$/);
	if (!m) return null;
	const [, bar, beat, fraction = "0"] = m;
	if (Number(beat) < 1 || Number(fraction) >= 1) return null;
	return { bar: Number(bar), beat: Number(beat), fraction: Number(fraction) };
}

/** How positions read and are typed: the transport's readout mode. */
export const POSITION_MODES = ["time", "timecode", "bars"] as const;
export type PositionMode = (typeof POSITION_MODES)[number];
export const POSITION_MODE_LABELS: Record<PositionMode, string> = {
	time: "Time",
	timecode: "Timecode",
	bars: "Bars",
};
