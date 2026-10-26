/**
 * The summary ffmpeg's `ebur128=peak=true` prints on stderr at the end of
 * a pass: the last `Summary:` block, its `I:` line (integrated loudness,
 * LUFS) and its `Peak:` line (true peak, dBFS). Null when the block or
 * either line is missing, or a value is not finite (a silent file reads
 * `-inf`).
 */
export function parseEbur128Summary(
	stderr: string,
): { integrated: number; truePeak: number } | null {
	const at = stderr.lastIndexOf("Summary:");
	if (at < 0) return null;
	const summary = stderr.slice(at);
	const value = (label: string) => {
		const m = summary.match(new RegExp(`^\\s*${label}:\\s*(\\S+)\\s+(?:LUFS|dBFS)\\s*$`, "m"));
		const n = m ? Number(m[1]) : NaN;
		return Number.isFinite(n) ? n : null;
	};
	const integrated = value("I");
	const truePeak = value("Peak");
	if (integrated === null || truePeak === null) return null;
	return { integrated, truePeak };
}
