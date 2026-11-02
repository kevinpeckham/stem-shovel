import { printChart } from "barmark";
import { CIRCLE_OF_FIFTHS } from "#lib/constants/circleOfFifths.js";
import type { ProgressionEntry } from "#lib/utils/chordRhythm.js";

const BARS_PER_LINE = 4;

/**
 * The pad's progression as a barmark chord chart (canonical, from
 * `printChart`): a directive line (key, time, tempo, and `feel: swing`
 * when the metronome's swing is closer to a triplet feel than to straight;
 * a chart carries the kind of feel, not an amount), a `## <name>` section,
 * and the bars, four to a line. The entries lie on a beat timeline cut at
 * the bar lines, one slot per beat: a chord's first beat is its label and
 * its later beats `/`, across a bar line too; a rest's first beat is
 * `N.C.`. A short final bar is filled with `/`. With no entries there is
 * no section: barmark reads a heading without bars as a replay of an
 * earlier section.
 */
export function progressionChart(
	entries: ProgressionEntry[],
	opts: { bpm: number; beatsPerBar: number; key?: number | null; name?: string; swing?: number },
): string {
	const lines = [directiveLine(opts)];
	if (entries.length > 0)
		lines.push(
			"",
			`## ${opts.name?.trim() || "Progression"}`,
			"",
			...barLines(entries, opts.beatsPerBar),
		);
	return printChart(`${lines.join("\n")}\n`);
}

/** `key: G, time: 4/4, tempo: 92`, with `feel: swing` past halfway to a triplet feel. */
function directiveLine(opts: {
	bpm: number;
	beatsPerBar: number;
	key?: number | null;
	swing?: number;
}): string {
	const directives: string[] = [];
	const position = typeof opts.key === "number" ? CIRCLE_OF_FIFTHS[opts.key] : undefined;
	if (position) directives.push(`key: ${position.major.id}`);
	directives.push(`time: ${opts.beatsPerBar}/4`, `tempo: ${Math.round(opts.bpm)}`);
	if ((opts.swing ?? 0) >= 0.5) directives.push("feel: swing");
	return directives.join(", ");
}

/** The entries one slot per beat, cut into bars of `beatsPerBar` and lines of four bars. */
function barLines(entries: ProgressionEntry[], beatsPerBar: number): string[] {
	const slots: string[] = [];
	for (const e of entries) {
		slots.push(e.kind === "chord" ? e.label : "N.C.");
		for (let b = 1; b < e.beats; b++) slots.push("/");
	}
	while (slots.length % beatsPerBar !== 0) slots.push("/");
	const bars: string[] = [];
	for (let i = 0; i < slots.length; i += beatsPerBar)
		bars.push(slots.slice(i, i + beatsPerBar).join(" "));
	const lines: string[] = [];
	for (let i = 0; i < bars.length; i += BARS_PER_LINE)
		lines.push(`| ${bars.slice(i, i + BARS_PER_LINE).join(" | ")} |`);
	return lines;
}
