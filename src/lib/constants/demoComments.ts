/**
 * The front page's demo comments. Real comments stay private to the account
 * that made them, so the demo starts with these examples and lets visitors
 * add their own, kept only in the page (gone on reload).
 */
export interface DemoComment {
	id: string;
	authorName: string;
	title: string;
	body: string;
	/** Seconds into the song, or null for a general comment. */
	at: number | null;
	createdAt: Date;
	/** Left by the visitor on this page (they can delete it). */
	mine: boolean;
}

export function exampleComments(): DemoComment[] {
	const now = Date.now();
	return [
		{
			id: "example-1",
			authorName: "Sam (drums)",
			title: "Bring the synth up before the verse",
			body: "The bass synth carries this section. Can it come up a touch here, before the vocal lands? Solo it and you will hear what I mean.",
			at: 8,
			createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
			mine: false,
		},
		{
			id: "example-2",
			authorName: "Jo (vocals)",
			title: "Lyrics for the second verse are in",
			body: "Second verse lyrics are in the Lyrics tab. Two lines still feel clumsy; comments welcome.",
			at: null,
			createdAt: new Date(now - 24 * 60 * 60 * 1000),
			mine: false,
		},
	];
}
