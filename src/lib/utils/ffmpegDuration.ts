/**
 * The input's length in seconds from ffmpeg's own report of it on stderr
 * (`Duration: 01:02:03.45, start: …`), which every run prints for each
 * input; null when there is none or it reads `N/A` (a stream without a
 * header).
 */
export function ffmpegDuration(stderr: string): number | null {
	const m = /Duration:\s*(\d+):(\d\d):(\d\d(?:\.\d+)?)/.exec(stderr);
	if (!m) return null;
	return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
}
