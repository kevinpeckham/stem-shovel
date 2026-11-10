/**
 * A chart draft the model ended with no text: the gateway's finish reason
 * (`content-filter` when its safety filter stopped the answer, `length`
 * when the output budget ran out, or whatever else it said). The remote
 * function answers one with the chart built from the detected chords and
 * this reason, so the card shows a chart and says why the AI's is missing
 * (stem-bench Study 38: three acoustic excerpts stop on the filter,
 * reproducibly, on an input of note lists).
 */
export class DraftStoppedError extends Error {
	constructor(readonly reason: string) {
		super(draftStopNotice(reason));
		this.name = "DraftStoppedError";
	}
}

/** What the draft card says when the AI's draft was stopped: the reason in plain words, and what the card shows instead. */
export function draftStopNotice(reason: string): string {
	const why =
		reason === "content-filter"
			? "The AI service's safety filter stopped the draft before it wrote anything. It does that on a few recordings, and sometimes not on a second try."
			: reason === "length"
				? "The AI ran out of room before it finished the draft."
				: `The AI answered with nothing (finish reason: ${reason}).`;
	return `${why} The draft below is built from the detected chords; Generate chart again to try the AI once more.`;
}
