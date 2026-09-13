/** 83.4 → "1:23.4" */
export function formatTime(seconds: number, decimals = 1): string {
	const s = Math.max(0, seconds);
	const m = Math.floor(s / 60);
	const rest = (s - m * 60).toFixed(decimals).padStart(3 + decimals, "0");
	return `${m}:${rest}`;
}
