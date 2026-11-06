import type { SongDocSaveKind } from "#lib/val/SongDocKindSchema.js";

/** The history panel's subject: a document (the project's or the user's own note) or a comment (docs/data-model.md). */
export type HistoryTarget =
	| { kind: "doc"; songId: string; doc: SongDocSaveKind; label: string; current?: string }
	| { kind: "comment"; commentId: string; label: string };

/** What a comment is checked with: its id, and its author for the rules. */
interface HistoryComment {
	id: string;
	userId: string;
}

/** What the page supplies, as functions since its data changes between songs. */
export interface SongHistoryOptions {
	/** The user may edit the song (restores a project document). */
	canEdit: () => boolean;
	/** The song's comments (`data.comments`). */
	comments: () => readonly HistoryComment[];
	/** SongComments.canEdit. */
	canEditComment: (c: HistoryComment) => boolean;
	/** SongComments.canDelete. */
	canDeleteComment: (c: HistoryComment) => boolean;
}

/**
 * The song page's history panel (DocHistoryPanel): which document or
 * comment it shows, and whether the user may restore a version of it (an
 * editor for a project document, anyone for their own note, the author or an
 * admin for a comment).
 */
export class SongHistory {
	target = $state<HistoryTarget | null>(null);
	#opts: SongHistoryOptions;
	#restorable = $derived.by(() => {
		const target = this.target;
		if (target?.kind === "doc") return target.doc === "mynotes" || this.#opts.canEdit();
		if (target?.kind === "comment") {
			const id = target.commentId;
			const c = this.#opts.comments().find((x) => x.id === id);
			return !!c && (this.#opts.canEditComment(c) || this.#opts.canDeleteComment(c));
		}
		return false;
	});

	constructor(opts: SongHistoryOptions) {
		this.#opts = opts;
	}

	/** The user may restore a version of the target. */
	get restorable() {
		return this.#restorable;
	}

	open(target: HistoryTarget) {
		this.target = target;
	}

	close() {
		this.target = null;
	}
}
