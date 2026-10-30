/**
 * The chord reconciler's user message, as stem-bench Study 13 registered
 * it: the song's key, meter, tempo and bar count, then each bar's detected
 * chord and transcribed notes. A key the song does not have reads "key
 * unknown"; a missing meter or tempo is left out.
 */
export function reconcileChordsMessage(input: {
	key: string | null;
	meter: string | null;
	tempo: string | null;
	chords: string[];
	bars: { notes: string }[];
}): string {
	const head = [
		input.key ? `key ${input.key}` : "key unknown",
		input.meter,
		input.tempo ? `${input.tempo} bpm` : null,
		`${input.chords.length} bars`,
	]
		.filter(Boolean)
		.join(", ");
	const lines = input.chords.map(
		(chord, i) =>
			`Bar ${i + 1}: detected ${chord || "N.C."}; notes: ${input.bars[i]?.notes || "(none)"}`,
	);
	return [
		`The song: ${head}.`,
		...lines,
		"Return the corrected chord for every bar, in order.",
	].join("\n");
}
