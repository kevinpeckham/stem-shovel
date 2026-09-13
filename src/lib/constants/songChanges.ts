/** What can change partway through a song, each from a point in time. */
export const SONG_CHANGE_KINDS = ["tempo", "key", "meter"] as const;

export type SongChangeKind = (typeof SONG_CHANGE_KINDS)[number];

/** Labels for the editor and the timeline. */
export const SONG_CHANGE_LABELS: Record<SongChangeKind, string> = {
	tempo: "Tempo",
	key: "Key",
	meter: "Time signature",
};

/** "4/4", "6/8", "7/8": beats over a note value. */
export const TIME_SIGNATURE_RE = /^\d{1,2}\/(1|2|4|8|16|32)$/;
