import type { ChartDraft } from "#lib/state/songChordDraft.svelte.js";
import type { ChartSource } from "#lib/val/ChartSourceSchema.js";

/**
 * Where a draft card's chart came from, saved as the song's chart source
 * (`song.chartSource`) at `at`: a score's file and its name, or the stems
 * for a chart drafted from them (the AI's or the one built from the
 * detected chords). A score's draft that names no file has no source.
 */
export function chartSourceOfDraft(draft: ChartDraft, at: string): ChartSource | undefined {
	if (draft.source !== "score") return { kind: "stems", at };
	if (!draft.scoreFile) return undefined;
	const name = draft.scoreName?.slice(0, 300);
	return { ...draft.scoreFile, ...(name ? { name } : {}), at };
}
