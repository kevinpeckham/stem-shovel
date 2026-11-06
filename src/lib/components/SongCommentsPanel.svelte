<script lang="ts">
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import CommentDeleteButton from "#lib/components/CommentDeleteButton.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import type { SongComments } from "#lib/state/songComments.svelte.js";
	import { formatDate } from "#lib/utils/formatDate.js";

	/** A song comment as the page loads it (listComments). */
	interface CommentItem {
		id: string;
		userId: string;
		authorName: string;
		title: string;
		body: string;
		/** Seconds into the song, or null when the comment has no position. */
		at: number | null;
		createdAt: Date;
		editedAt: Date | null;
	}
	interface Props {
		/** The panel is open (the header's button and the Comments row toggle it). */
		open: boolean;
		/** Who may edit or delete a comment, and the popover that posts and edits them. */
		comments: SongComments;
		/** The song's comments (`data.comments`). */
		list: readonly CommentItem[];
		canComment: boolean;
		/** The Stem Player's engine: a comment's position seeks it. */
		engine: StemEngine | null;
		/** A song position as the player's readout shows it. */
		showPos: (seconds: number) => string;
		/** An edited comment's earlier versions: the history panel. */
		onhistory: (target: { kind: "comment"; commentId: string; label: string }) => void;
	}
	let {
		open = $bindable(),
		comments,
		list,
		canComment,
		engine,
		showPos,
		onhistory,
	}: Props = $props();
</script>

<!-- The comments (docs/data-model.md "comment"): a panel of their own, opened from the Comments row's button under the stems; the list as the Docs tab had it. -->
<div class="{open ? '' : 'hidden'} max-w-full lg:contents">
	<FloatingPanel
		{open}
		title="Comments"
		storageKey="stemshovel.song.comments-panel"
		width={520}
		height={640}
		onminimise={() => (open = false)}
	>
		{#snippet controls()}
			{#if canComment}
				<button
					class="button button-xs flex items-center"
					type="button"
					title="Add a comment"
					aria-label="Add a comment"
					onclick={() => comments.open()}
				>
					<span class="i-ph-plus"></span>
				</button>
			{/if}
		{/snippet}
		<div class="h-full min-h-full bg-blue-300/5 border rounded-md border-current/40 px-6 pt-6 pb-8">
			{#if list.length === 0}
				<p class="opacity-80">No comments yet.</p>
			{:else}
				<ol class="grid gap-4">
					{#each list as c (c.id)}
						{@render comment(c)}
					{/each}
				</ol>
			{/if}
		</div>
	</FloatingPanel>
</div>

<!-- One comment: its title, author and date, the "edited" history button, the position, the body, and Edit / Delete for those allowed. -->
{#snippet comment(c: CommentItem)}
	<li class="rounded-md border border-white/10 bg-black/20 px-4 py-3" id="comment-{c.id}">
		<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
			<h3 class="font-600">{c.title}</h3>
			<span class="text-12px opacity-70">
				{c.authorName} · {formatDate(c.createdAt)}
				{#if c.editedAt}<button
						type="button"
						class="ml-1 rounded border border-current/30 px-1 text-9px uppercase tracking-wider hover:border-current/70"
						title="Edited {formatDate(c.editedAt)}: see the earlier versions"
						onclick={() => onhistory({ kind: "comment", commentId: c.id, label: `“${c.title}”` })}
						>edited</button
					>{/if}
			</span>
		</div>
		{#if c.at !== null}
			<button
				type="button"
				class="mt-1 text-12px link"
				onclick={() => engine?.seek(c.at ?? 0)}
				title="Go to this position"
			>
				<span class="i-ph-map-pin mr-1" aria-hidden="true"></span>{showPos(c.at)}
			</button>
		{/if}
		<p class="mt-2 whitespace-pre-line text-15px">{c.body}</p>
		{#if comments.canEdit(c) || comments.canDelete(c)}
			<div class="mt-2 flex gap-3 text-12px">
				{#if comments.canEdit(c)}
					<button type="button" class="link" onclick={() => comments.edit(c)}>Edit</button>
				{/if}
				{#if comments.canDelete(c)}
					<CommentDeleteButton id={c.id} title={c.title} key={c.id} />
				{/if}
			</div>
		{/if}
	</li>
{/snippet}
