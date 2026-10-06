/**
 * Which revisions an autosave leaves behind (docs/multitrack-recorder.md,
 * "Data model"): the unnamed ones beyond the newest `keep`, by number.
 * Named revisions are never pruned, and do not count towards `keep`.
 */
export function staleAutosaves(
	revisions: { id: string; number: number; name: string | null }[],
	keep: number,
): string[] {
	return revisions
		.filter((r) => r.name === null)
		.sort((a, b) => b.number - a.number)
		.slice(Math.max(0, keep))
		.map((r) => r.id);
}
