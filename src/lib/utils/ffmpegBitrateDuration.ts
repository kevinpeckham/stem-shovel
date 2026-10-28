/**
 * An input's length estimated from its size and the bitrate ffmpeg reports
 * when it cannot read a duration (`Duration: N/A, bitrate: 3072 kb/s`): a
 * WAV piped into stdin has no length ffmpeg will print, but raw PCM's
 * bitrate is exact, so the size gives it. Null without a reported bitrate.
 */
export function ffmpegBitrateDuration(stderr: string, bytes: number): number | null {
	const m = /Duration:\s*N\/A,\s*bitrate:\s*(\d+(?:\.\d+)?)\s*kb\/s/.exec(stderr);
	if (!m || Number(m[1]) <= 0) return null;
	return (bytes * 8) / (Number(m[1]) * 1000);
}
