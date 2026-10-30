<script lang="ts">
	import { deleteComment } from "#lib/remote/comments.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";

	/**
	 * Delete for a song comment (or a demo's): a confirm, then the remote
	 * form, keyed per list so two lists showing one comment keep their
	 * pending state apart.
	 */
	interface Props {
		id: string;
		title: string;
		/** The remote form's key: the id, or the list's prefix and the id ("timeline:…"). */
		key: string;
	}
	let { id, title, key }: Props = $props();
	let remove = $derived(deleteComment.for(key));
</script>

<form
	{...remove.enhance(async ({ submit }) => {
		if (!confirm(`Delete the comment "${title}"?`)) return;
		await submit();
		notify("Comment deleted");
	})}
>
	<input {...remove.fields.id.as("hidden", id)} />
	<button class="link" disabled={!!remove.pending}>{remove.pending ? "Deleting…" : "Delete"}</button
	>
</form>
