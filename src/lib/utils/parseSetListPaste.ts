import { MAX_SET_LIST_ITEMS } from "#lib/val/SetListSchema.js";

/** How long a row's title may be (the set list's ItemTitleSchema). */
const MAX_LINE = 120;

/**
 * A leading list marker: a number with `.`, `)`, `:` or a dash ("1.", "1)",
 * "01 -", "1:"; a dash only with a space on one side, so "7-Eleven" stays),
 * or a bullet ("-", "•", "–", "—", and "*" or "#" before a space).
 */
const MARKER =
	/^(?:\d{1,3}\s*(?:\.(?!\d)|\)|:)\s*|\d{1,3}(?:\s+[-–—]\s*|[-–—]\s+)|[-•–—]\s*|[*#]\s+)/u;

/**
 * The lines of a pasted set list (docs/band-plan.md, "Set list"): one row
 * per non-empty line, its list marker dropped and its spacing tidied, cut to
 * the 120 characters a row holds, and no more than `MAX_SET_LIST_ITEMS`.
 */
export function parseSetListPaste(text: string): string[] {
	const lines: string[] = [];
	for (const raw of text.split(/\r\n|\r|\n/)) {
		const line = raw.trim().replace(MARKER, "").replace(/\s+/gu, " ").slice(0, MAX_LINE).trim();
		if (line === "") continue;
		lines.push(line);
		if (lines.length === MAX_SET_LIST_ITEMS) break;
	}
	return lines;
}
