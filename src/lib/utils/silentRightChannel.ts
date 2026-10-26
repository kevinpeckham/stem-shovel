/**
 * Whether ffmpeg's `astats` report (its stderr, with
 * `measure_overall=none:measure_perchannel=Peak_level`) describes a
 * two-channel file whose right channel is silent while the left carries
 * sound: the shape a phone's mono microphone left in a stereo recording
 * made through a `MediaStreamAudioDestinationNode` on iOS before the
 * recorder's stereo fill (static/worklets/stereo-fill.js). The
 * rendition of such a file is folded to mono (src/lib/server/transcode.ts).
 * "Silent" is a peak at or under `floorDb` (digital silence reads
 * `-inf`); a quiet real right channel stays stereo.
 */
export function silentRightChannel(stderr: string, floorDb = -80): boolean {
	const peaks = peakLevels(stderr);
	if (peaks.length !== 2) return false;
	const [left, right] = peaks as [number, number];
	return right <= floorDb && left > floorDb;
}

/** The per-channel peak levels in dB, in channel order (`-Infinity` for digital silence). */
export function peakLevels(stderr: string): number[] {
	const peaks: number[] = [];
	for (const line of stderr.split("\n")) {
		const m = /Peak level dB:\s*(-?inf|-?[\d.]+)/.exec(line);
		if (!m) continue;
		peaks.push(m[1]!.endsWith("inf") ? -Infinity : Number(m[1]));
	}
	return peaks;
}
