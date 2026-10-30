<script lang="ts">
	import CommentCard from "#lib/components/CommentCard.svelte";
	import CommentDeleteButton from "#lib/components/CommentDeleteButton.svelte";
	import type { SongComments } from "#lib/state/songComments.svelte.js";

	/**
	 * A song comment's card (the player's comment row, a demo's list): the
	 * shared card with Edit for its author and Delete for its author or an
	 * owner / admin. The song's and a demo's differ only in how a position
	 * reads, where Go to seeks and which edit opens, so those come in.
	 */
	interface Props {
		comment: {
			id: string;
			userId: string;
			title: string;
			body: string;
			authorName: string;
			createdAt: Date;
			editedAt: unknown;
			at: number | null;
		};
		comments: SongComments;
		/** The list, for the delete form's key: "timeline" or "demo". */
		list: string;
		/** A position as this list reads it. */
		pos: (seconds: number) => string;
		onseek: (seconds: number) => void;
		onedit: () => void;
	}
	let { comment, comments, list, pos, onseek, onedit }: Props = $props();
</script>

<CommentCard {comment} {pos} {onseek} onedit={comments.canEdit(comment) ? onedit : undefined}>
	{#if comments.canDelete(comment)}
		<CommentDeleteButton id={comment.id} title={comment.title} key="{list}:{comment.id}" />
	{/if}
</CommentCard>
