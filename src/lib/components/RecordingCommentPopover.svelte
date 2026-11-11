<script lang="ts">
	import CommentFields from "#lib/components/CommentFields.svelte";
	import { createComment, updateComment } from "#lib/remote/comments.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";

	/**
	 * One popover to post or edit a comment on a mix (docs/mixes.md) or a
	 * demo recording of the song, its position as time: the mix's page and
	 * the demo's page share it. The page opens it with `open()`, a draft's
	 * id meaning an edit of that comment (its author's).
	 */
	interface Props {
		songId: string;
		/** What the comment is on: a mix or a demo of the song, by id. */
		on: { kind: "mix" | "demo"; id: string };
		/** As the heading names it: `mix v3`, `“Phone memo”`. */
		name: string;
		/** The Playhead button: where the recording is playing. */
		playhead: { disabled: boolean; read: () => string };
	}
	let { songId, on, name, playhead }: Props = $props();

	let panel = $state<HTMLDivElement | null>(null);
	let draft = $state<{ id: string | null; title: string; body: string; at: string }>({
		id: null,
		title: "",
		body: "",
		at: "",
	});
	/** Post a comment (no id) or edit one, the fields starting at the draft's (the remote form keeps what was last typed). */
	export function open(start: Partial<typeof draft> = {}) {
		draft = { id: null, title: "", body: "", at: "", ...start };
		const f = draft.id ? updateComment.fields : createComment.fields;
		f.title.set(draft.title);
		f.body.set(draft.body);
		f.position.set(draft.at);
		panel?.showPopover();
	}
</script>

<div
	id="song-comment"
	popover="auto"
	bind:this={panel}
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">
			{draft.id ? "Edit comment" : "Add a comment"} on {name}
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
	{#if draft.id}
		{@const remoteForm = updateComment}
		<form
			class="grid gap-3"
			{...remoteForm.enhance(async ({ submit }) => {
				await submit();
				if (!remoteForm.fields.allIssues()) {
					notify("Comment updated");
					panel?.hidePopover();
				}
			})}
		>
			<input {...remoteForm.fields.id.as("hidden", draft.id)} />
			<CommentFields
				fields={remoteForm.fields}
				{draft}
				hint="optional, as time"
				placeholder="1:23.4"
				{playhead}
			/>
			<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
				>{remoteForm.pending ? "Saving…" : "Save"}</button
			>
		</form>
	{:else}
		{@const remoteForm = createComment}
		<form
			class="grid gap-3"
			{...remoteForm.enhance(async ({ submit }) => {
				await submit();
				if (!remoteForm.fields.allIssues()) {
					notify("Comment posted");
					panel?.hidePopover();
				}
			})}
		>
			<input {...remoteForm.fields.songId.as("hidden", songId)} />
			<input {...remoteForm.fields.mixId.as("hidden", on.kind === "mix" ? on.id : "")} />
			<input {...remoteForm.fields.demoId.as("hidden", on.kind === "demo" ? on.id : "")} />
			<CommentFields
				fields={remoteForm.fields}
				{draft}
				hint="optional, as time"
				placeholder="1:23.4"
				{playhead}
			/>
			<button class="button-accent justify-self-start" disabled={!!remoteForm.pending}
				>{remoteForm.pending ? "Posting…" : "Post comment"}</button
			>
		</form>
	{/if}
</div>
