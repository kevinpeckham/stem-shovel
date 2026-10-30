<script lang="ts">
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import CommentFields from "#lib/components/CommentFields.svelte";
	import { createComment, updateComment } from "#lib/remote/comments.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { POSITION_PLACEHOLDER, type SongChanges } from "#lib/state/songChanges.svelte.js";
	import type { SongComments } from "#lib/state/songComments.svelte.js";
	import { formatTime } from "#lib/utils/formatTime.js";

	/**
	 * The one popover that posts or edits a comment on the song or on a demo.
	 * Its draft and error are `SongComments`, which opens and closes it through
	 * the bound element; the Playhead button reads the Stem Player's engine or,
	 * on a demo, the demo panel.
	 */
	interface Props {
		comments: SongComments;
		songId: string;
		/** Positions in the readout's format, and the placeholder for it. */
		changes: SongChanges;
		/** The Stem Player's engine, once it has one. */
		engine: StemEngine | null;
		/** The player's Demos view, for a demo comment's playhead. */
		demoPanel: { currentPosition(): number } | null;
		/** A comment was posted: the page opens the Comments panel. */
		onposted: () => void;
	}
	let { comments, songId, changes, engine, demoPanel, onposted }: Props = $props();
	let placeholder = $derived(comments.draft.demoId ? "0:00.0" : POSITION_PLACEHOLDER[changes.mode]);
	/** A demo's playhead is the demo panel's, as time; the song's is the engine's, in the readout's format. */
	let playhead = $derived(
		comments.draft.demoId
			? {
					disabled: !demoPanel,
					read: () => formatTime(demoPanel?.currentPosition() ?? 0, 2),
				}
			: {
					disabled: !engine || engine.status !== "ready",
					read: () => changes.editPos(engine?.position ?? 0),
				},
	);
</script>

<!-- One popover for posting and editing a comment. -->
<div
	id="song-comment"
	popover="auto"
	bind:this={comments.panel}
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">
			{comments.draft.id ? "Edit comment" : "Add a comment"}{#if comments.demoTarget}{" "}
				on demo "{comments.demoTarget.label}"{/if}
		</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="song-comment"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	{#if comments.draft.id}
		{@const remoteForm = updateComment}
		<form
			class="grid gap-3"
			{...remoteForm.enhance(async ({ submit }) => {
				comments.error = null;
				await submit();
				if (!remoteForm.fields.allIssues()) {
					notify("Comment updated");
					comments.close();
				}
			})}
		>
			<input {...remoteForm.fields.id.as("hidden", comments.draft.id)} />
			<CommentFields
				fields={remoteForm.fields}
				draft={comments.draft}
				hint="optional"
				{placeholder}
				{playhead}
			/>
			{#if comments.error}<p class="text-sm text-red-400" role="alert">{comments.error}</p>{/if}
			<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
				>{remoteForm.pending ? "Saving…" : "Save"}</button
			>
		</form>
	{:else}
		{@const remoteForm = createComment}
		<form
			class="grid gap-3"
			{...remoteForm.enhance(async ({ submit }) => {
				comments.error = null;
				await submit();
				if (!remoteForm.fields.allIssues()) {
					notify("Comment posted");
					onposted();
					comments.close();
				}
			})}
		>
			<input {...remoteForm.fields.songId.as("hidden", songId)} />
			<input {...remoteForm.fields.demoId.as("hidden", comments.draft.demoId)} />
			<CommentFields
				fields={remoteForm.fields}
				draft={comments.draft}
				hint="optional"
				{placeholder}
				{playhead}
			/>
			{#if comments.error}<p class="text-sm text-red-400" role="alert">{comments.error}</p>{/if}
			<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
				>{remoteForm.pending ? "Posting…" : "Post comment"}</button
			>
		</form>
	{/if}
</div>
