import {
	TRIM_LEAD_PAD_SECONDS,
	TRIM_MIN_CUT_SECONDS,
	TRIM_TAIL_PAD_SECONDS,
} from "$lib/constants/trimSilence";

export interface SilenceBounds {
	/** Where the kept audio starts and ends, in seconds of the original. */
	start: number;
	end: number;
	/** The original's decoded length. */
	duration: number;
}

/**
 * Reads ffmpeg's stderr from a `silencedetect` pass over a whole file
 * (`-af silencedetect=... -f null -`) and says what to keep: the audio
 * from a little before the first sound to a little after the last. Null
 * when there is nothing worth cutting, when the file is silent throughout,
 * or when the log cannot be read; the take is then left as recorded.
 */
export function silenceBounds(
	log: string,
	pads = { lead: TRIM_LEAD_PAD_SECONDS, tail: TRIM_TAIL_PAD_SECONDS, minCut: TRIM_MIN_CUT_SECONDS },
): SilenceBounds | null {
	const duration = decodedLength(log);
	if (!duration) return null;
	const events: { kind: "start" | "end"; at: number }[] = [];
	for (const m of log.matchAll(/silence_(start|end): (-?\d+(?:\.\d+)?)/g)) {
		events.push({ kind: m[1] as "start" | "end", at: Number(m[2]) });
	}
	let start = 0;
	let end = duration;
	let rest = events;
	if (rest[0]?.kind === "start" && rest[0].at <= 0.05) {
		// Silence from the very beginning: keep from a little before it ends.
		const firstEnd = rest[1];
		if (!firstEnd || firstEnd.kind !== "end") return null; // silent throughout
		start = Math.max(0, firstEnd.at - pads.lead);
		rest = rest.slice(2);
	}
	const last = rest[rest.length - 1];
	if (last?.kind === "start") {
		// A silence still open when the file ended.
		end = Math.min(duration, last.at + pads.tail);
	} else if (last?.kind === "end" && last.at >= duration - 0.05) {
		// Or one that closed at the very end.
		const open = rest[rest.length - 2];
		if (open?.kind === "start") end = Math.min(duration, open.at + pads.tail);
	}
	if (start < pads.minCut && end > duration - pads.minCut) return null;
	if (end - start < pads.minCut) return null;
	return { start, end, duration };
}

/** The length ffmpeg decoded, from the last `time=` of its progress line. */
function decodedLength(log: string): number {
	let seconds = 0;
	for (const m of log.matchAll(/time=(\d+):(\d\d):(\d\d(?:\.\d+)?)/g)) {
		seconds = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
	}
	return seconds;
}
