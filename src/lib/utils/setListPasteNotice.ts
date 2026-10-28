import { plural } from "./plural.js";

/**
 * What the set-list editor says after a pasted list went in: "3 rows added,
 * 2 of them songs"; shorter when every line was a song, or none.
 */
export function setListPasteNotice(added: number, matched: number): string {
	if (matched === added) return `${plural(added, "song")} added`;
	if (matched === 0) return `${plural(added, "row")} added as text`;
	return `${plural(added, "row")} added, ${matched === 1 ? "1 of them a song" : `${matched} of them songs`}`;
}
