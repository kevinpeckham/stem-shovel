import * as v from "valibot";

/** What can change partway through a song, each from a point in time. */
export const SONG_CHANGE_KINDS = ["tempo", "key", "meter"] as const;

export const SongChangeKindSchema = v.picklist(SONG_CHANGE_KINDS);

export type SongChangeKind = v.InferOutput<typeof SongChangeKindSchema>;

/** Labels for the editor and the timeline. */
export const SONG_CHANGE_LABELS: Record<SongChangeKind, string> = {
	tempo: "Tempo",
	key: "Key",
	meter: "Time signature",
};

/** "4/4", "6/8", "7/8": beats over a note value. */
export const TIME_SIGNATURE_RE = /^\d{1,2}\/(1|2|4|8|16|32)$/;

/** Per-kind check of the value text; null when it is fine, else the message. */
export function songChangeValueError(kind: SongChangeKind, value: string): string | null {
	const v = value.trim();
	if (!v) return "Enter a value.";
	if (kind === "tempo") {
		const n = Number(v);
		if (!Number.isFinite(n) || n < 20 || n > 400)
			return "Tempo is a number between 20 and 400 bpm.";
	} else if (kind === "key") {
		if (v.length > 20) return "Keep the key under 20 characters.";
	} else if (!TIME_SIGNATURE_RE.test(v)) return "Time signature looks like 4/4 or 6/8.";
	return null;
}

/**
 * One change: the kind, where it starts (seconds) and its value as text —
 * "120" or "87.5" for tempo, "F#m" for key, "6/8" for time signature.
 */
export const SongChangeSchema = v.pipe(
	v.object({
		kind: SongChangeKindSchema,
		start: v.pipe(v.number(), v.minValue(0, "A change cannot start before 0:00.")),
		value: v.pipe(v.string(), v.trim(), v.maxLength(20)),
	}),
	v.check(
		(c) => songChangeValueError(c.kind, c.value) === null,
		"Invalid value for this kind of change.",
	),
);

export type SongChange = v.InferOutput<typeof SongChangeSchema>;

export const MAX_SONG_CHANGES = 96;

export const SongChangesSchema = v.pipe(
	v.array(SongChangeSchema),
	v.maxLength(MAX_SONG_CHANGES, `At most ${MAX_SONG_CHANGES} changes.`),
);

/** Argument of the saveChanges command. */
export const SongChangesSaveSchema = v.object({
	id: v.pipe(v.string(), v.minLength(1)),
	changes: SongChangesSchema,
});

/** How a change reads on the timeline: "120 bpm", "F#m", "6/8". */
export function formatSongChange(c: SongChange): string {
	return c.kind === "tempo" ? `${c.value} bpm` : c.value;
}

/**
 * The kinds worth a timeline lane: a kind with a single change at 0:00 is
 * the song's fixed tempo / key / meter (the header shows it), not a change.
 */
export function timelineKinds(changes: SongChange[]): SongChangeKind[] {
	return SONG_CHANGE_KINDS.filter((kind) => {
		const of = changes.filter((c) => c.kind === kind);
		return of.length > 1 || (of.length === 1 && of[0].start > 0);
	});
}
