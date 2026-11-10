import { parseChart } from "barmark";

/** An alteration item as a notation program stacks them: omit5, no3, add9, sus4, b5, #9, maj7… */
const ITEM = /(?:omit|no|add|sus|maj|b|#)\d{1,2}/g;

/** The ways a stacked spelling becomes barmark's, tried in order; the first that parses wins. */
function candidates(token: string): string[] {
	const out: string[] = [];
	// Items run together inside a parenthesis get commas: D6(omit5add9) → D6(omit5,add9).
	const commas = token.replace(/\(([^)]*)\)/g, (_, inner: string) => {
		const items = inner.match(ITEM);
		return items && items.join("") === inner ? `(${items.join(",")})` : `(${inner})`;
	});
	if (commas !== token) out.push(commas);
	// A bare omit/no outside any parenthesis gets one: Gadd9omit3 → Gadd9(omit3).
	const wrapped = commas.replace(/(?<!\()((?:omit|no)\d)(?![^(]*\))/g, "($1)");
	if (wrapped !== commas) out.push(wrapped);
	// An altered fifth straight after the root joins the parenthesis: F#b5(omit3) → F#(b5,omit3).
	const fifth = wrapped.replace(/^([A-G][#b]?)([#b]5)\(([^)]*)\)/, "$1($2,$3)");
	if (fifth !== wrapped) out.push(fifth);
	return out;
}

const chordParses = (token: string) =>
	!parseChart(`| ${token} |`).diagnostics.some((d) => d.severity === "error");

/**
 * A chart read whose chord symbols are spelled the way a notation program
 * stacks alterations (Dorico's "D6 add9 omit5", read as D6(omit5add9) or
 * D6add9omit5, and F#b5(omit3)) respelled the way barmark reads them:
 * items in a parenthesis separated by commas, a bare omit or no in a
 * parenthesis of its own, an altered fifth inside the parenthesis. Only a
 * token barmark reports as unreadable is touched, and only when the
 * respelling parses on its own; every other chord stays as written. Pure.
 */
export function repairChordSpellings(text: string): string {
	const lines = text.split("\n");
	let changed = true;
	for (let round = 0; changed && round < 64; round++) {
		changed = false;
		for (const d of parseChart(lines.join("\n")).diagnostics) {
			if (d.severity !== "error" || !d.token || !/^[A-G]/.test(d.token)) continue;
			const line = lines[d.line - 1];
			if (line === undefined || !line.includes(d.token)) continue;
			const fix = candidates(d.token).find(chordParses);
			if (!fix) continue;
			lines[d.line - 1] = line.split(d.token).join(fix);
			changed = true;
			break;
		}
	}
	return lines.join("\n");
}
