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
