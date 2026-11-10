import { parseChart } from "barmark";

const FUSED =
	/^(?:a rehearsal mark is a cell of its own|words go on a bar, not on a rehearsal mark)$/;

/**
 * A chart read whose rehearsal marks share a cell with the bar after them
 * (`|: @A G | / |`, `| @B "Play 3 times" C |`) given the cell of their own
 * barmark wants (`|: @A | G | / |`), driven by barmark's diagnostics, so a
 * chart that already parses comes back as it was. Pure.
 */
export function repairRehearsalCells(text: string): string {
	const lines = text.split("\n");
	let changed = true;
	for (let round = 0; changed && round < 64; round++) {
		changed = false;
		for (const d of parseChart(lines.join("\n")).diagnostics) {
			if (d.severity !== "error" || !FUSED.test(d.message) || !d.token) continue;
			const line = lines[d.line - 1];
			if (line === undefined) continue;
			const next = line.replace(
				new RegExp(`(${d.token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})\\s+(?=[^|\\s])`),
				"$1 | ",
			);
			if (next === line) continue;
			lines[d.line - 1] = next;
			changed = true;
			break;
		}
	}
	return lines.join("\n");
}
