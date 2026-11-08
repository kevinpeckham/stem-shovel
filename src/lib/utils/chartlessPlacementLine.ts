import type { ChartlessGrid, WitnessName } from "#lib/audio/chartlessGrid.js";
import { formatTime } from "./formatTime.js";

/** Each witness as the sentence names it, in the order it lists them. */
const WITNESS_WORDS: [WitnessName, string][] = [
	["harmonicRhythm", "the chord changes"],
	["timeZero", "the recording's start"],
	["sections", "the section changes"],
];

/** "a", "a and b", "a, b and c". */
function listed(words: string[]): string {
	return words.length < 2
		? (words[0] ?? "")
		: `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/**
 * What the chartless placement did (audio/chartlessGrid.ts), in a sentence
 * for the detected chords card (SongTempoKeyTab.svelte): where bar 1 landed,
 * how many bars, and which witnesses agreed on bar one; at the song's own
 * start, that it was. Empty when nothing was placed.
 */
export function chartlessPlacementLine(placement: ChartlessGrid | null): string {
	if (!placement) return "";
	const n = placement.barStarts.length - 1;
	const bars = `${n} ${n === 1 ? "bar" : "bars"}`;
	if (placement.byStart)
		return `Bars placed on the stems' own beat from your start of bar 1: ${bars}.`;
	const agreed = WITNESS_WORDS.filter(([name]) =>
		placement.witnesses.some((w) => w.name === name && w.cls === placement.cls),
	).map(([, words]) => words);
	const who = agreed.length === 1 ? `${agreed[0]} alone` : `${listed(agreed)} agree`;
	return `Bars placed on the stems' own beat: bar 1 at ${formatTime(placement.barStarts[0]!)}, ${bars}; ${who}.`;
}
