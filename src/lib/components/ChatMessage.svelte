<script lang="ts">
	import ChatEditForm from "#lib/components/ChatEditForm.svelte";
	import ChatReactions from "#lib/components/ChatReactions.svelte";
	import ChatText from "#lib/components/ChatText.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import { deleteMessage, reactToMessage } from "#lib/remote/chat.remote.js";
	import type { ChatMessageRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { CHAT_REACTION_EMOJI, type ChatReactionEmoji } from "#lib/val/ChatSchema.js";

	/**
	 * One message in a chat (docs/chat.md, SongChat.svelte): its text
	 * (ChatText, the people it mentions picked out), an "(edited)" mark,
	 * its reactions under it (ChatReactions), and on hover a smiley that opens the
	 * six emoji (ContextMenu) and, for its author (or an admin, delete
	 * only), Edit and Delete. Edit swaps in ChatEditForm. The parent hears
	 * of a change (`onchange`: an edit or a reaction) and a removal
	 * (`onremove`).
	 */
	interface Props {
		message: ChatMessageRow;
		/** The reader, whose own mention stands out. */
		meId?: string | null;
		canEdit: boolean;
		canDelete: boolean;
		/** Whether the reader may react (anyone who may write in the chat). */
		canReact?: boolean;
		/** The chat's song or session, for the edit form's `@` picker. */
		songId?: string;
		sessionId?: string;
		onseek?: (seconds: number) => void;
		onchange: (message: ChatMessageRow) => void;
		onremove: (id: string) => void;
	}
	let {
		message,
		meId = null,
		canEdit,
		canDelete,
		canReact = false,
		songId = "",
		sessionId = "",
		onseek,
		onchange,
		onremove,
	}: Props = $props();

	let editing = $state(false);
	let picker = $state<"open" | "closed">("closed");
	let reacting = $state(false);
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
	/** A tap on an emoji, in the picker or on a chip: on or off for the reader. */
	async function react(emoji: ChatReactionEmoji) {
		picker = "closed";
		if (reacting) return;
		reacting = true;
		try {
			const r = await reactToMessage({ id: message.id, emoji });
			onchange(r.message);
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			reacting = false;
		}
	}
</script>

{#snippet emojiRow()}
	<div class="flex gap-1 px-2" role="group" aria-label="Reactions">
		{#each CHAT_REACTION_EMOJI as emoji (emoji)}
			<button
				type="button"
				class="grid size-8 place-items-center rounded text-18px hover-bg-white/10 focus-visible-bg-white/10"
				aria-label="React with {emoji}"
				disabled={reacting}
				onclick={() => react(emoji)}>{emoji}</button
			>
		{/each}
	</div>
{/snippet}

<li class="group/msg relative -mx-1 rounded px-1 hover-bg-white/5" data-chat-message>
	{#if editing}
		<ChatEditForm
			{message}
			{songId}
			{sessionId}
			onsaved={onchange}
			onclose={() => (editing = false)}
		/>
	{:else}
		<p class="whitespace-pre-wrap break-words text-15px leading-snug">
			<ChatText body={message.body} mentions={message.mentions} {meId} {onseek} />
			{#if message.editedAt}<span class="ml-1 text-11px opacity-50">(edited)</span>{/if}
		</p>
		<ChatReactions reactions={message.reactions} {canReact} busy={reacting} onreact={react} />
		{#if canEdit || canDelete || canReact}
			<div
				class="absolute -top-1 right-0 {picker === 'open'
					? 'flex'
					: 'hidden'} items-center gap-1 rounded bg-oxford/90 px-1 text-11px group-hover/msg:flex focus-within:flex"
			>
				{#if canReact}
					<ContextMenu
						bind:openState={picker}
						ariaLabel="Add reaction"
						title="Add reaction"
						iconClass="i-ph-smiley text-14px"
						clearButtonBaseClasses
						buttonClasses="link-dim grid place-items-center"
						popoverClasses="!px-0 !py-1"
						items={[{ kind: "snippet", snippet: emojiRow }]}
					/>
				{/if}
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
