import { parseChart } from "barmark";

/**
 * A chart read whose chord symbols are spelled the way a notation program
 * stacks alterations (Dorico's "D6 add9 omit5", read as D6(omit5add9) or
 * Gadd9omit3, and F#b5(omit3)) respelled the way barmark reads them, by
 * barmark's own word: since 0.23 every such diagnostic names the token and
 * carries a `suggestion` (the stacked forms as warnings that already read,
 * the altered fifth as an error), and the app applies the suggestion in
 * place of the token. Nothing is guessed: a token without a suggestion
 * (`Gb5(omit3)` could be a power chord) and every other chord stay as
 * written. A suggestion that rewrites more than the token (a cell, for a
 * rehearsal mark with words) is not a spelling and is left to
 * `repairRehearsalCells`. Pure.
 */
export function repairChordSpellings(text: string): string {
	const lines = text.split("\n");
	let changed = true;
	for (let round = 0; changed && round < 64; round++) {
		changed = false;
		for (const d of parseChart(lines.join("\n")).diagnostics) {
			if (!d.token || !d.suggestion || !/^[A-G]/.test(d.token) || d.suggestion.includes("|"))
				continue;
			const line = lines[d.line - 1];
			if (line === undefined || !line.includes(d.token)) continue;
			lines[d.line - 1] = line.split(d.token).join(d.suggestion);
			changed = true;
			break;
		}
	}
	return lines.join("\n");
}
