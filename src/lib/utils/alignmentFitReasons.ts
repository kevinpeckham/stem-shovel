import type { Refusal } from "@barmark/listen";
import { formatTime } from "./formatTime.js";

/** A detail's number, NaN when it has none. */
const num = (r: Refusal, key: string) => Number(r.detail?.[key] ?? Number.NaN);

/** The song check's sentence for each fit reason, from the refusal's numbers. */
const SAID: Partial<Record<Refusal["reason"], (r: Refusal) => string>> = {
	"bar-one-far": (r) =>
		`bar 1 at ${formatTime(num(r, "bar1"), 0)} where the sound starts at ${formatTime(num(r, "music"), 0)}`,
	"bar-length-off": (r) =>
		`bars ${num(r, "medianBar").toFixed(1)} s where the tempo says ${num(r, "declaredBar").toFixed(2)} s`,
	"weak-fit": () => "the chart fits the recording little better than a wrong one would",
	"bars-off-middle": () =>
		"the chart's bars do not line up with the recording through its middle; is this the right chart?",
	"no-bars": () => "too few bars",
};

/** Reasons new with @barmark/listen, said in its words, lower-cased and without the full stop to sit in the list. */
const OWN_WORDS = new Set<Refusal["reason"]>(["not-same-piece", "no-period"]);

/**
 * Why an aligned chart's bar starts were not kept as the song's bar timing
 * (@barmark/listen's `alignChart` refusals after the warping), in words for
 * the user, in the order the package lists them: bar 1 too far from where
 * the music starts, bars off the declared bar, a chart barely better than
 * a wrong one, bars that do not line up through the middle, too few bars;
 * a wrong chart (`not-same-piece`) and a recording with no onsets
 * (`no-period`), which the app did not refuse a map for before, in the
 * package's own sentence. A map that does not check (`map-invalid`) says
 * nothing, as before.
 */
export function alignmentFitReasons(refusals: Refusal[]): string[] {
	return refusals.flatMap((r) => {
		const said = SAID[r.reason];
		if (said) return [said(r)];
		if (!OWN_WORDS.has(r.reason)) return [];
		const words = r.message.replace(/\.$/, "");
		return [words.charAt(0).toLowerCase() + words.slice(1)];
	});
}
