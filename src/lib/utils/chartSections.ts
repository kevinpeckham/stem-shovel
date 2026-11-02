import { beatsOf, parseChart, type PlayedBar } from "barmark";
import {
	barAt,
	beatUnitAt,
	beatsPerBarAt,
	secondsAtBar,
	type BarGrid,
} from "#lib/audio/measures.js";

export interface ChartSection {
	name: string;
	/** Seconds on the Studio's timeline. */
	start: number;
	/** The chart's bar the section opens on (1-based, play order). */
	bar: number;
}

export interface ChartSections {
	sections: ChartSection[];
	bars: number;
	/** Where the last bar ends, in seconds on the Studio's timeline. */
	seconds: number;
	warnings: string[];
	errors: string[];
}

const NAME_MAX = 40;

const lineMessage = (d: { line: number; message: string }) => `line ${d.line}: ${d.message}`;

/** Each bar's start, then the end of the last, on the chart's own tempo from `from`. */
function chartClock(bars: PlayedBar[], from: number): number[] {
	const times = [from];
	let tempo = bars[0]?.tempo ?? 120;
	for (const bar of bars) {
		tempo = bar.tempo ?? tempo;
		times.push(times[times.length - 1]! + (beatsOf(bar.meter) * 60) / tempo);
	}
	return times;
}

/** Each bar's start, then the end of the last, on the Studio's bar lines from the bar holding `from`. */
function gridClock(bars: PlayedBar[], grid: BarGrid, from: number): number[] {
	const startBar = barAt(grid, from).bar;
	return Array.from({ length: bars.length + 1 }, (_, k) => secondsAtBar(grid, startBar + k));
}

/** The warnings a chart without a tempo earns when it lands on the Studio's grid. */
function gridWarnings(first: PlayedBar, grid: BarGrid, from: number): string[] {
	const out = ["the chart names no tempo; its bars were placed on the Studio's grid"];
	const bpb = beatsPerBarAt(grid, from);
	const unit = beatUnitAt(grid, from);
	if (first.meter.n !== bpb || first.meter.d !== unit) {
		out.push(
			`the chart is in ${first.meter.n}/${first.meter.d} and the Studio in ${bpb}/${unit}; bars will not line up`,
		);
	}
	return out;
}

/** The bars where a section begins: the first, and each whose section differs from the bar before. */
function sectionStarts(bars: PlayedBar[], times: number[]): ChartSection[] {
	const out: ChartSection[] = [];
	bars.forEach((bar, k) => {
		if (k > 0 && bar.section === bars[k - 1]!.section) return;
		out.push({ name: (bar.section ?? "Section").slice(0, NAME_MAX), start: times[k]!, bar: k + 1 });
	});
	return out;
}

/**
 * A barmark chord chart's sections as section markers from `from`: timed by
 * the chart's tempo when its first bar has one, else on the Studio's bar
 * lines from the bar holding `from`. Replays count as sections again.
 */
export function chartSections(text: string, opts: { grid: BarGrid; from: number }): ChartSections {
	const parse = parseChart(text);
	const errors = parse.diagnostics.filter((d) => d.severity === "error").map(lineMessage);
	const warnings = parse.diagnostics.filter((d) => d.severity !== "error").map(lineMessage);
	const bars = parse.bars;
	const first = bars[0];
	if (!first) {
		if (!errors.length) errors.push("the chart has no bars");
		return { sections: [], bars: 0, seconds: opts.from, warnings, errors };
	}
	const timed = first.tempo != null;
	const times = timed ? chartClock(bars, opts.from) : gridClock(bars, opts.grid, opts.from);
	if (!timed) warnings.push(...gridWarnings(first, opts.grid, opts.from));
	return {
		sections: sectionStarts(bars, times),
		bars: bars.length,
		seconds: times[bars.length]!,
		warnings,
		errors,
	};
}
