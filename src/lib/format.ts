/** 83.4 → "1:23.4" */
export function formatTime(seconds: number): string {
	const s = Math.max(0, seconds);
	const m = Math.floor(s / 60);
	const rest = (s - m * 60).toFixed(1).padStart(4, "0");
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
