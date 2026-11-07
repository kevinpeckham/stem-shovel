import { formatTime } from "./formatTime.js";
import { median } from "./median.js";

/** How well an alignment's bars fit the song's declared tempo and the recording: `ok`, or why not. */
export interface AlignmentFit {
	ok: boolean;
	bar1: number;
	medianBar: number;
	declaredBar: number;
	ratio: number;
	reasons: string[];
}

/** The median bar may be off the declared bar by this fraction. */
const BAR_TOLERANCE = 0.15;
/** A wrong chart's cost over this one's must reach this: below, the chart barely beats a wrong one. */
const MIN_RATIO = 1.5;

/**
 * Whether an aligned chart's bar starts are fit to keep as the song's bar
 * timing (stem-bench Study 12's weakness is the first and last boundaries):
 * bar 1 within one declared bar of where the music starts (`startAt` or the
 * first sound, the later), the median bar within 15 % of the declared bar,
 * the chart fitting the recording at least 1.5 times better than a
 * wrong one would, and, when the alignment carries its end repair, the
 * repair not refused (`repair` null: the chart's bars do not line up with
 * the recording's middle, stem-bench Study 26c's wrong-chart detector).
 * Each failure is a reason, in words for the user.
 */
export function alignmentFit(
	a: {
		barStarts: number[];
		cost: number;
		controlCost: number;
		firstSound: number;
		repair?: object | null;
	},
	declared: { startAt: number; barSeconds: number },
): AlignmentFit {
	const declaredBar = declared.barSeconds;
	const ratio = a.cost > 0 ? a.controlCost / a.cost : Infinity;
	const bar1 = a.barStarts[0] ?? Number.NaN;
	if (a.barStarts.length < 2) {
		return {
			ok: false,
			bar1,
			medianBar: Number.NaN,
			declaredBar,
			ratio,
			reasons: ["too few bars"],
		};
	}
	const medianBar = median(a.barStarts.slice(1).map((t, i) => t - a.barStarts[i]!));
	const music = Math.max(declared.startAt, a.firstSound);
	const reasons: string[] = [];
	if (Math.abs(bar1 - music) > declaredBar) {
		reasons.push(
			`bar 1 at ${formatTime(bar1, 0)} where the sound starts at ${formatTime(music, 0)}`,
		);
	}
	if (Math.abs(medianBar - declaredBar) > declaredBar * BAR_TOLERANCE) {
		reasons.push(`bars ${medianBar.toFixed(1)} s where the tempo says ${declaredBar.toFixed(2)} s`);
	}
	if (ratio < MIN_RATIO) {
		reasons.push("the chart fits the recording little better than a wrong one would");
	}
	if (a.repair === null) {
		reasons.push(
			"the chart's bars do not line up with the recording through its middle; is this the right chart?",
		);
	}
	return { ok: reasons.length === 0, bar1, medianBar, declaredBar, ratio, reasons };
}
