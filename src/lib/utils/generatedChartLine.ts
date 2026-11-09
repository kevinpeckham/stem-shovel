import { formatTime } from "#lib/utils/formatTime.js";

const count = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * The notification after "Generate chart from the stems" (SongChordDraft's
 * `generateChart`): the chart's bars and sections, the start of bar 1 and
 * tempo the placement set, when it set them, and the verdict's notes
 * (utils/generatedChartVerdict.ts), when it has any.
 */
export function generatedChartLine({
	bars,
	sections,
	placed,
	notes = [],
}: {
	bars: number;
	sections: number;
	placed: { startAt: number; bpm: number } | null;
	notes?: string[];
}): string {
	const chart = `Chart generated from the stems: ${count(bars, "bar")}, ${sections ? count(sections, "section") : "no sections"}`;
	const line = placed
		? `${chart}; start of bar 1 set to ${formatTime(placed.startAt)} and tempo to ${placed.bpm} bpm.`
		: `${chart}.`;
	return notes.length ? `${line} Note: ${notes.join("; ")}.` : line;
}
