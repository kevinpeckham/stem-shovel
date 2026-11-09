import type { ChartlessGrid, ChartlessRefusal, WitnessName } from "#lib/audio/chartlessGrid.js";
import { formatTime } from "./formatTime.js";

/** Each witness as the sentence names it, in the order it lists them, and whether the words are singular. */
const WITNESS_WORDS: [WitnessName, string, boolean][] = [
	["harmonicRhythm", "the chord changes", false],
	["timeZero", "the recording's start", true],
	["sections", "the section changes", false],
];

/** A refusal's sentence; `undecided` is built from the witnesses. */
const REFUSAL_LINES = {
	"no-input": "Bar 1 not placed from the stems: they gave no usable beat.",
	"no-fit": "Bar 1 not placed from the stems: no bar on their beat fits the recording.",
	unavailable: "",
};

/** "a", "a and b", "a, b and c". */
function listed(words: string[]): string {
	return words.length < 2
		? (words[0] ?? "")
		: `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** What each witness read, 1-based beats ("the chord changes say beat 3"), in `WITNESS_WORDS` order. */
function readings(refusal: ChartlessRefusal): string[] {
	return WITNESS_WORDS.flatMap(([name, words, singular]) => {
		const w = refusal.witnesses.find((x) => x.name === name);
		if (!w) return [];
		if (w.cls === null) return [`${words} ${singular ? "abstains" : "abstain"}`];
		return [`${words} ${singular ? "says" : "say"} beat ${w.cls + 1}`];
	});
}

/** Why bar 1 was not placed: the witnesses' readings when the vote was undecided. */
function refusalLine(refusal: ChartlessRefusal): string {
	if (refusal.reason !== "undecided") return REFUSAL_LINES[refusal.reason];
	const said = readings(refusal);
	return `Bar 1 not placed from the stems${said.length ? `: ${said.join(", ")}` : ""}. The bars follow your tempo and start of bar 1.`;
}

/**
 * What the chartless placement did (audio/chartlessGrid.ts), in a sentence
 * for the detected chords card (SongTempoKeyTab.svelte): where bar 1 landed,
 * how many bars, and which witnesses agreed on bar one; at the song's own
 * start, that it was. Nothing placed: why, from the refusal (what each
 * witness read when the vote was undecided); empty when the reading was
 * unavailable or there is neither.
 */
export function chartlessPlacementLine(
	placement: ChartlessGrid | null,
	refusal: ChartlessRefusal | null = null,
): string {
	if (!placement) return refusal ? refusalLine(refusal) : "";
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
