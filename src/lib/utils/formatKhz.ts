/** A sample rate as people say it: 44100 → "44.1", 48000 → "48", 96000 → "96" (the caller adds "kHz"). */
export function formatKhz(sampleRate: number): string {
	const k = sampleRate / 1000;
	return Number.isInteger(k) ? String(k) : k.toFixed(1);
}
