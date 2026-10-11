import type { SongChange } from "#lib/val/SongChangeSchema.js";

/** The song's keys in the order they first appear, each once ("C major", "A♭ major", …). */
export function keySequence(changes: SongChange[]): string[] {
	const seen: string[] = [];
	for (const c of [...changes].filter((c) => c.kind === "key").sort((a, b) => a.start - b.start))
		if (!seen.includes(c.value)) seen.push(c.value);
	return seen;
}

/**
 * The song's key as one line: the starting key, then the others that
 * appear, "C major (also A♭ major, F major)" (a user's own wording, for a
 * song that moves through several keys); "" without a key.
 */
export function keyLine(changes: SongChange[]): string {
	const keys = keySequence(changes);
	if (keys.length === 0) return "";
	if (keys.length === 1) return keys[0]!;
	return `${keys[0]} (also ${keys.slice(1).join(", ")})`;
}
