import {
	MAX_TAKE_SECONDS,
	SILENCE_STOP_SECONDS,
	TAKE_WARNING_SECONDS,
} from "$lib/constants/takeLimits";

export type TakeStopReason = "limit" | "silence" | "silent";

/**
 * Why a running take should stop now, if it should: "limit" at the time
 * cap, "silence" after a stretch of silence in a take that had sound
 * (saved), "silent" after the same stretch in a take that never had any
 * (discarded). `elapsed` and `sinceLoud` are seconds.
 */
export function takeStopReason(
	elapsed: number,
	sinceLoud: number,
	everLoud: boolean,
): TakeStopReason | null {
	if (elapsed >= MAX_TAKE_SECONDS) return "limit";
	if (sinceLoud >= SILENCE_STOP_SECONDS) return everLoud ? "silence" : "silent";
	return null;
}

/** The notice for a stop, or the warning ahead of the time limit (once, when `elapsed` first passes it). */
export function takeStopNotice(reason: TakeStopReason): string {
	const minutes = Math.round(MAX_TAKE_SECONDS / 60);
	const quiet = Math.round(SILENCE_STOP_SECONDS / 60);
	switch (reason) {
		case "limit":
			return `The take reached the ${minutes}-minute limit and was saved.`;
		case "silence":
			return `Nothing but silence for ${quiet} minutes: the take stopped and was saved.`;
		case "silent":
			return `Nothing but silence for ${quiet} minutes: the take was discarded.`;
	}
}

export function takeWarningDue(elapsed: number): boolean {
	return elapsed >= TAKE_WARNING_SECONDS;
}

export function takeWarningNotice(): string {
	return `${Math.round(TAKE_WARNING_SECONDS / 60)} minutes in. A take stops and saves at ${Math.round(MAX_TAKE_SECONDS / 60)} minutes.`;
}
