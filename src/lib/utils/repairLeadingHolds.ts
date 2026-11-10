import { parseChart } from "barmark";

/** barmark's error for a / cell with no chord before it. */
const NOTHING_TO_HOLD = "/ has nothing before it to hold";
/** A / cell alone between bar lines (or after |: / before :|), the first on a line. */
const HOLD_CELL = /((?:^|\|:?)\s*)\/(?=\s*(?::?\||$))/;

/**
 * A chart read whose opening measures hold a chord before any is named
 * (`/` cells before the first chord symbol: a melody-only intro or chorus
 * the reading model wrote as holds, as the prompt once asked) with those
 * cells as N.C. instead, so barmark plays it and the score engraves. Only
 * the cells barmark reports ("/ has nothing before it to hold") change,
 * one at a time from the first, so a hold after a chord stays a hold; any
 * other chart comes back as it was. Pure.
 */
export function repairLeadingHolds(text: string): string {
	let out = text;
	for (let i = 0; i < 64; i++) {
		const bad = parseChart(out).diagnostics.find(
			(d) => d.severity === "error" && d.message === NOTHING_TO_HOLD,
		);
		if (!bad) return out;
		const lines = out.split("\n");
		const line = lines[bad.line - 1];
		if (line === undefined || !HOLD_CELL.test(line)) return out;
		lines[bad.line - 1] = line.replace(HOLD_CELL, "$1N.C.");
		out = lines.join("\n");
	}
	return out;
}
