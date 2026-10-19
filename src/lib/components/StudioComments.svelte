<script lang="ts">
	import { formatTime } from "#lib/utils/formatTime.js";
	import type { StudioCommentView } from "#lib/val/StudioSchema.js";

	/**
	 * Comments on a Dawn song (docs/dawn-daw-plan.md, D7): the thread in
	 * order, each with its author and, when pinned, the moment it is about
	 * (a click there moves the playhead); a box to write one, pinned to the
	 * playhead when the checkbox is on. Deleting is the author's or an
	 * admin's (`canDelete`). The page posts and refreshes.
	 */
	interface Props {
		comments: StudioCommentView[];
		/** The playhead, for "at the playhead". */
		position: number;
		userId: string;
		canDelete: (c: StudioCommentView) => boolean;
		busy?: boolean;
		onpost: (input: { body: string; at: number | null }) => void;
		ondelete: (id: string) => void;
		onjump: (at: number) => void;
	}
	let {
		comments,
		position,
		userId,
		canDelete,
		busy = false,
		onpost,
		ondelete,
		onjump,
	}: Props = $props();
	let body = $state("");
	let pin = $state(true);
	function post() {
		const text = body.trim();
		if (!text) return;
		onpost({ body: text, at: pin ? Math.round(position * 1000) / 1000 : null });
		body = "";
	}
	const when = (d: Date | string) =>
		new Date(d).toLocaleString(undefined, {
			month: "short",
			day: "numeric",
			hour: "2-digit",
			minute: "2-digit",
		});
</script>

<div class="grid gap-3 text-13px" data-studio-comments>
	{#if comments.length === 0}
		<p class="text-dim">No comments yet. Pin one to the playhead to talk about a moment.</p>
	{:else}
		<ul class="grid gap-2" aria-label="Comments">
			{#each comments as c (c.id)}
				<li class="rounded border border-white/10 px-3 py-2 grid gap-1" data-comment={c.id}>
					<div class="flex items-center gap-2 text-11px opacity-70">
						<span class="font-500 {c.userId === userId ? 'text-accent' : ''}">{c.userName}</span>
						<span>{when(c.createdAt)}</span>
						{#if c.at !== null}
							<button
								type="button"
								class="underline tabular-nums hover-text-accent"
								title="Move the playhead there"
								aria-label="Go to {formatTime(c.at)}"
								onclick={() => onjump(c.at!)}>at {formatTime(c.at)}</button
							>
						{/if}
						{#if canDelete(c)}
							<button
								type="button"
								class="ml-auto opacity-70 hover-opacity-100"
								aria-label="Delete comment by {c.userName}"
								title="Delete"
								onclick={() => ondelete(c.id)}
							>
								<span class="i-ph-trash text-12px" aria-hidden="true"></span>
							</button>
						{/if}
					</div>
					<p class="whitespace-pre-wrap">{c.body}</p>
				</li>
			{/each}
		</ul>
	{/if}
	<form
		class="grid gap-2"
		onsubmit={(e) => {
			e.preventDefault();
			post();
		}}
	>
		<textarea
			class="field w-full min-h-20 text-13px"
			placeholder="Write a comment…"
			aria-label="Comment"
			maxlength="2000"
			bind:value={body}
			onkeydown={(e) => {
				if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
					e.preventDefault();
					post();
				}
			}}></textarea>
		<div class="flex items-center gap-3">
			<label class="flex items-center gap-2 text-blue-100/90">
				<input type="checkbox" class="accent-maximumYellow" bind:checked={pin} />
				At the playhead ({formatTime(position)})
			</label>
			<button class="button button-xs ml-auto" type="submit" disabled={busy || !body.trim()}>
				<span class="i-ph-paper-plane-right" aria-hidden="true"></span> Post
			</button>
		</div>
	</form>
</div>
