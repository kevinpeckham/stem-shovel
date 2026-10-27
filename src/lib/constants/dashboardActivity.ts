/** What one activity event is: the row's kind decides the verb the dashboard shows. */
export const ACTIVITY_KINDS = [
	"stem",
	"demo",
	"mix",
	"session-recording",
	"doc",
	"chat",
	"session-chat",
	"comment",
	"session-comment",
	"song",
	"project",
] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

/** The facts `canViewSong` reads, so a caller can drop what the person may not open; null for a session's event (every member sees sessions). */
export interface ActivitySongFacts {
	id: string;
	isPrivate: boolean;
	projectId: string;
	project: { isPrivate: boolean; isRestricted: boolean };
}

/** One thing that happened in an account (the dashboard's Activity): who did it, to what, when, and where to go. */
export interface ActivityEvent {
	/** `${kind}:${rowId}`, unique across kinds. */
	id: string;
	kind: ActivityKind;
	at: Date;
	/** The person's name (user.name) when the row records one, else null. */
	who: string | null;
	/** The thing: a stem's, demo's or mix's label ("v3 Rough mix" for a mix), a doc's kind ("chart", "lyrics", "notes"), a session recording's title, a song's or project's name; "" for a message or comment. */
	label: string;
	/** The song's title or the session's display name. */
	title: string;
	href: string;
	song: ActivitySongFacts | null;
}

/** What a piece of unfinished server work is about. */
export const PENDING_KINDS = [
	"stem",
	"demo",
	"mix",
	"session-recording",
	"song-mix",
	"notes",
	"notation",
] as const;
export type PendingKind = (typeof PENDING_KINDS)[number];
export type PendingState = "uploading" | "rendering" | "failed";

/** Work the server has not finished on something (the dashboard's "Still rendering"): what, in which state, since when, and where it lives. */
export interface PendingWork {
	/** `${kind}:${rowId}`. */
	id: string;
	kind: PendingKind;
	state: PendingState;
	/** As an event's label; "" for song-mix and notes. */
	label: string;
	/** The song's title or the session's display name. */
	title: string;
	href: string;
	/** The row's createdAt, or the job's startedAt for song-mix and notes. */
	since: Date;
	song: ActivitySongFacts | null;
}
