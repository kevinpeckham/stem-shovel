<script lang="ts">
	import ChatEditForm from "#lib/components/ChatEditForm.svelte";
	import ChatText from "#lib/components/ChatText.svelte";
	import { deleteMessage } from "#lib/remote/chat.remote.js";
	import type { ChatMessageRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	/**
	 * One message in a song's chat (docs/chat.md, SongChat.svelte): its text
	 * (ChatText), an "(edited)" mark, and, for its author (or an admin,
	 * delete only), Edit and Delete on hover. Edit swaps in ChatEditForm.
	 * The parent hears of a change (`onchange`) and a removal (`onremove`).
	 */
	interface Props {
		message: ChatMessageRow;
		canEdit: boolean;
		canDelete: boolean;
		onseek?: (seconds: number) => void;
		onchange: (message: ChatMessageRow) => void;
		onremove: (id: string) => void;
	}
	let { message, canEdit, canDelete, onseek, onchange, onremove }: Props = $props();

	let editing = $state(false);
	let remove = $derived(deleteMessage.for(message.id));
	async function confirmDelete(submit: () => Promise<unknown>) {
		if (!confirm("Delete this message?")) return;
		try {
			await submit();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
			return;
		}
		onremove(message.id);
	}
</script>

<li class="group/msg relative -mx-1 rounded px-1 hover-bg-white/5" data-chat-message>
	{#if editing}
		<ChatEditForm {message} onsaved={onchange} onclose={() => (editing = false)} />
	{:else}
		<p class="whitespace-pre-wrap break-words text-15px leading-snug">
			<ChatText body={message.body} {onseek} />
			{#if message.editedAt}<span class="ml-1 text-11px opacity-50">(edited)</span>{/if}
		</p>
		{#if canEdit || canDelete}
			<div
				class="absolute -top-1 right-0 hidden gap-1 rounded bg-oxford/90 px-1 text-11px group-hover/msg:flex focus-within:flex"
			>
				{#if canEdit}
					<button
						type="button"
						class="link-dim"
						aria-label="Edit message"
						onclick={() => (editing = true)}>Edit</button
					>
				{/if}
				{#if canDelete}
					<form {...remove.enhance(({ submit }) => confirmDelete(submit))}>
						<input {...remove.fields.id.as("hidden", message.id)} />
						<button class="link-dim" aria-label="Delete message" disabled={!!remove.pending}
							>{remove.pending ? "Deleting…" : "Delete"}</button
						>
					</form>
				{/if}
			</div>
		{/if}
	{/if}
</li>
