/** The clause of @barmark/musicxml's no-chord-symbols error that names the parts with notes. */
const PARTS_CLAUSE =
	/these parts have notes: (.+?)\.(?:\s*Import one as note sets with --part\.?)?$/i;

/**
 * The parts a score without chord symbols could be charted from: the names in
 * the import's "no chord symbols; … these parts have notes: Piano, Bass."
 * error (the package names them only there), in its order; none for any
 * other diagnostics.
 */
export function scorePartsOf(diagnostics: { message: string }[]): string[] {
	for (const { message } of diagnostics) {
		if (!message.startsWith("no chord symbols")) continue;
		const names = PARTS_CLAUSE.exec(message)?.[1];
		if (names) return names.split(", ").filter((name) => name.trim() !== "");
	}
	return [];
}
