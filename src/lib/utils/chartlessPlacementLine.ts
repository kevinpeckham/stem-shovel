import type { ChartlessRefusal } from "#lib/audio/chartlessGridInBrowser.js";
import type { PlacedGrid, Witness } from "@barmark/listen";
import { formatTime } from "./formatTime.js";

/** Each witness as the sentence names it, in the order it lists them, and whether the words are singular. */
const WITNESS_WORDS: [Witness["name"], string, boolean][] = [
	["harmonicRhythm", "the chord changes", false],
	["timeZero", "the recording's start", true],
	["sections", "the section changes", false],
];

/**
 * A refusal's sentence by @barmark/listen's reason (`downbeat-undecided`
 * is built from the witnesses): a flat onset envelope or nothing to read
 * gave no usable beat; bar one at or past the end fits nothing; an
 * unavailable reading says nothing.
 */
const REFUSAL_LINES: Partial<Record<ChartlessRefusal["reason"], string>> = {
	"no-period": "Bar 1 not placed from the stems: they gave no usable beat.",
	"invalid-input": "Bar 1 not placed from the stems: they gave no usable beat.",
	"nothing-fits": "Bar 1 not placed from the stems: no bar on their beat fits the recording.",
	unavailable: "",
};

/** "a", "a and b", "a, b and c". */
function listed(words: string[]): string {
	return words.length < 2
		? (words[0] ?? "")
		: `${words.slice(0, -1).join(", ")} and ${words.at(-1)}`;
}

/** What each witness read, 1-based beats ("the chord changes say beat 3"), in `WITNESS_WORDS` order. */
function readings(witnesses: Witness[]): string[] {
	return WITNESS_WORDS.flatMap(([name, words, singular]) => {
		const w = witnesses.find((x) => x.name === name);
		if (!w) return [];
		if (w.cls === null) return [`${words} ${singular ? "abstains" : "abstain"}`];
		return [`${words} ${singular ? "says" : "say"} beat ${w.cls + 1}`];
	});
}

/** Why bar 1 was not placed: the witnesses' readings when the vote was undecided; the package's words for a reason the app has no sentence for. */
function refusalLine(refusal: ChartlessRefusal): string {
	if (refusal.reason !== "downbeat-undecided")
		return REFUSAL_LINES[refusal.reason] ?? `Bar 1 not placed from the stems: ${refusal.message}`;
	const said = readings(refusal.reading?.witnesses ?? []);
	return `Bar 1 not placed from the stems${said.length ? `: ${said.join(", ")}` : ""}. The bars follow your tempo and start of bar 1.`;
}

/**
 * What the chartless placement did (@barmark/listen's `findGrid`), in a
 * sentence for the detected chords card (SongTempoKeyTab.svelte): where
 * bar 1 landed, how many bars, and which witnesses agreed on bar one; at
 * the song's own start, that it was. Nothing placed: why, from the refusal
 * (what each witness read when the vote was undecided); empty when the
 * reading was unavailable or there is neither.
 */
export function chartlessPlacementLine(
	placed: PlacedGrid | null,
	refusal: ChartlessRefusal | null = null,
): string {
	if (!placed) return refusal ? refusalLine(refusal) : "";
	const { bars } = placed.grid;
	const { byStart, witnesses, cls } = placed.reading;
	const n = bars.length - 1;
	const count = `${n} ${n === 1 ? "bar" : "bars"}`;
	if (byStart) return `Bars placed on the stems' own beat from your start of bar 1: ${count}.`;
	const agreed = WITNESS_WORDS.filter(([name]) =>
		witnesses.some((w) => w.name === name && w.cls === cls),
	).map(([, words]) => words);
	const who = agreed.length === 1 ? `${agreed[0]} alone` : `${listed(agreed)} agree`;
	return `Bars placed on the stems' own beat: bar 1 at ${formatTime(bars[0]!)}, ${count}; ${who}.`;
}
