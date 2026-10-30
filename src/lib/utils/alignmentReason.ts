/** Why the chart could not be aligned to the recording: the chart query's reasons, and the stems not decoded yet. */
export type AlignmentReason = "none" | "musicxml" | "unread" | "no-bars" | "audio";

const REASONS: Record<AlignmentReason, string> = {
	none: "Write the song's chart or attach its score first.",
	musicxml:
		"Alignment reads a chart read or the chord chart; this score is MusicXML, which it cannot read yet.",
	unread: "The score has not been read yet: run Ask AI to check first, which reads it.",
	"no-bars": "The chart has no bars to place: it needs a tempo and chord symbols.",
	audio: "The stems are still decoding; try again when the player is ready.",
};

/** The sentence to show a person when the chart could not be aligned. */
export function alignmentReason(reason: AlignmentReason): string {
	return REASONS[reason];
}
