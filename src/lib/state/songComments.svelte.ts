import { createComment, updateComment } from "#lib/remote/comments.remote.js";
import { formatTime } from "#lib/utils/formatTime.js";

/** The comment popover's draft: a new comment, or the one being edited. */
export interface CommentDraft {
	id: string | null;
	title: string;
	body: string;
	at: string;
	/** A comment on a demo recording (docs/uploads-and-blob.md, "Sessions" review): its id; "" for the song's stream. */
	demoId: string;
}

/** What the cards and the edit read of a comment row. */
interface CommentRow {
	id: string;
	userId: string;
	title: string;
	body: string;
	/** Seconds into the song (or the demo), or null when the comment has no position. */
	at: number | null;
}

/** What the page supplies, as functions since its data changes between songs. */
export interface SongCommentsOptions {
	/** The signed-in user, or null. */
	user: () => { id: string } | null | undefined;
	/** The user's account memberships (the layout's data), to tell an owner or admin. */
	memberships: () => readonly { accountId: string; role: string }[] | null | undefined;
	/** The song's account. */
	accountId: () => string;
	/** The demos a comment may be on (the ready ones). */
	readyDemos: () => readonly { id: string; label: string }[];
	/** A song position as the editors show it (SongChanges.editPos). */
	editPos: (seconds: number) => string;
}

const EMPTY: CommentDraft = { id: null, title: "", body: "", at: "", demoId: "" };

/**
 * The song page's comments: who may edit or delete one, and the one popover
 * that posts or edits them (its draft and error). The popover element is the
 * component's, bound to `panel`, so `open` and `close` reach it without the
 * page in between.
 */
export class SongComments {
	draft = $state<CommentDraft>({ ...EMPTY });
	error = $state<string | null>(null);
	/** The popover element (SongCommentPopover binds it). */
	panel: HTMLDivElement | null = null;
	#opts: SongCommentsOptions;

	constructor(opts: SongCommentsOptions) {
		this.#opts = opts;
	}

	/** The demo the draft is on, or null for the song's stream. */
	get demoTarget() {
		return this.#opts.readyDemos().find((d) => d.id === this.draft.demoId) ?? null;
	}

	/** The user is an owner or admin of the song's account (the chat reads it too). */
	get isAdmin() {
		const accountId = this.#opts.accountId();
		const role = this.#opts.memberships()?.find((m) => m.accountId === accountId)?.role;
		return role === "owner" || role === "admin";
	}

	/** A comment is edited by its author. */
	canEdit = (c: { userId: string }) => this.#opts.user()?.id === c.userId;
	/** A comment is deleted by its author or an owner / admin. */
	canDelete = (c: { userId: string }) => this.canEdit(c) || this.isAdmin;

	/** Open the popover on a new comment (or an edit, with an id). */
	open(draft: Partial<CommentDraft> = {}) {
		this.draft = { ...EMPTY, ...draft };
		this.error = null;
		// The form fields keep what was last typed; push the draft into them explicitly.
		const f = this.draft.id ? updateComment.fields : createComment.fields;
		f.title.set(this.draft.title);
		f.body.set(this.draft.body);
		f.position.set(this.draft.at);
		this.panel?.showPopover();
	}

	/** Edit a song comment: its position in the readout's format. */
	edit(c: CommentRow) {
		this.open({
			id: c.id,
			title: c.title,
			body: c.body,
			at: c.at === null ? "" : this.#opts.editPos(c.at),
		});
	}

	/** A demo's comment: positions are time, the demo panel's playhead (docs/uploads-and-blob.md, "Sessions" review). */
	editDemo(c: CommentRow & { demoId: string }) {
		this.open({
			id: c.id,
			demoId: c.demoId,
			title: c.title,
			body: c.body,
			at: c.at === null ? "" : formatTime(c.at, 2),
		});
	}

	close() {
		this.panel?.hidePopover();
	}
}
