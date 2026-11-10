import { parseChart } from "barmark";

const ENDING = /^an ending starts its own bar line$/;
const REPEAT = /^\|: must open a bar line and :\| must close one$/;

/** The line split so its `|:` opens a line and its `:|` closes one; unchanged when it already does. */
function splitRepeat(line: string): string {
	let out = line;
	// A `|:` after other cells: what precedes it closes its own line.
	const open = out.search(/(?<=\S\s*)\|:/);
	if (open > 0) out = `${out.slice(0, open).trimEnd()} |\n${out.slice(open)}`;
	// A `:|` with more after it: what follows opens its own line.
	out = out.replace(/:\|\s*(?=\S)/, (_m, offset: number, s: string) => {
		const rest = s.slice(offset + _m.length);
		return rest.startsWith("|") ? ":|\n" : ":|\n|";
	});
	return out;
}

/** The line split before its ending token (`|1`, `|2`, `|1-3`, `|1,3`) when the ending does not start it. */
function splitEnding(line: string, token: string): string {
	const at = line.indexOf(token, 1);
	if (at <= 0) return line;
	// The pipe before the ending may close a `:|`; then the ending needs a pipe of its own.
	if (line[at - 1] === ":") return `${line.slice(0, at + 1)}\n|${line.slice(at + 1).trimStart()}`;
	return `${line.slice(0, at).trimEnd()} |\n${line.slice(at)}`;
}

type Diagnostic = ReturnType<typeof parseChart>["diagnostics"][number];

/** The first line barmark reports for a repeat or ending out of place, split as it wants: `[index, lines]`, or null. */
function firstSplit(lines: string[]): [number, string[]] | null {
	const fix = (d: Diagnostic, line: string) =>
		ENDING.test(d.message)
			? splitEnding(line, d.token ?? "")
			: REPEAT.test(d.message)
				? splitRepeat(line)
				: line;
	for (const d of parseChart(lines.join("\n")).diagnostics) {
		if (d.severity !== "error") continue;
		const line = lines[d.line - 1];
		if (line === undefined) continue;
		const next = fix(d, line);
		if (next !== line) return [d.line - 1, next.split("\n")];
	}
	return null;
}

/**
 * A chart read whose repeats and endings share a line with the bars around
 * them, rewritten the way barmark reads them: `|:` opens a line, `:|` closes
 * one, and each ending is a line of its own. A model reading a score writes
 * `| @A |: A | / | D |1 / :|` for a verse that opens on a repeat and closes
 * on endings; barmark wants `| @A |`, `|: A | / | D |`, `|1 / :|`. Only a
 * line barmark reports is touched, driven by its diagnostics, so a chart
 * that already parses comes back as it was. Pure.
 */
export function repairRepeatLines(text: string): string {
	const lines = text.split("\n");
	for (let round = 0; round < 64; round++) {
		const split = firstSplit(lines);
		if (!split) break;
		lines.splice(split[0], 1, ...split[1]);
	}
	return lines.join("\n");
}
