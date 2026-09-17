/** 83.4 → "1:23.4"; with 0 decimals, 83.4 → "1:23" */
export function formatTime(seconds: number, decimals = 1): string {
	const s = Math.max(0, seconds);
	const m = Math.floor(s / 60);
	// Two digits of seconds, the point and decimals only when asked for.
	const rest = (s - m * 60).toFixed(decimals).padStart(decimals > 0 ? 3 + decimals : 2, "0");
	return `${m}:${rest}`;
}
