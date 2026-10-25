<script lang="ts">
	import ChatMentionPicker from "#lib/components/ChatMentionPicker.svelte";
	import { editMessage } from "#lib/remote/chat.remote.js";
	import type { ChatMessageRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { mentionsIn } from "#lib/utils/mentionsIn.js";
	import { CHAT_MESSAGE_MAX } from "#lib/val/ChatSchema.js";

	/**
	 * A chat message being edited in place (docs/chat.md, ChatMessage.svelte):
	 * its text in a box, Enter saves and Escape cancels, Save and Cancel
	 * buttons too. `@` opens the people picker as in the composer; the
	 * message's mentions, and those picked, still written as `@Name` go
	 * with the save. The saved row goes to the parent (`onsaved`); a
	 * cancel or a save closes the form (`onclose`).
	 */
	interface Props {
		message: ChatMessageRow;
		/** The chat's song or session, for the picker. */
		songId?: string;
		sessionId?: string;
		onsaved: (message: ChatMessageRow) => void;
		onclose: () => void;
	}
	let { message, songId = "", sessionId = "", onsaved, onclose }: Props = $props();
	// svelte-ignore state_referenced_locally
	let draft = $state(message.body);
	// svelte-ignore state_referenced_locally
	let picked = $state<{ id: string; name: string }[]>([...message.mentions]);
	let box = $state<HTMLTextAreaElement | null>(null);
	let picker = $state<ReturnType<typeof ChatMentionPicker>>();
	let mentions = $derived(mentionsIn(draft, picked));
	let edit = $derived(editMessage.for(message.id));
	function onkeydown(e: KeyboardEvent) {
		if (picker?.keydown(e)) return;
		if (e.key === "Escape") {
			e.preventDefault();
			onclose();
		} else if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			if (draft.trim()) (e.currentTarget as HTMLTextAreaElement).form?.requestSubmit();
		}
	}
	async function save(submit: () => Promise<unknown>) {
		try {
			await submit();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
			return;
		}
		if (edit.fields.allIssues()) return;
		const r = edit.result;
		if (r?.message) onsaved(r.message);
		onclose();
	}
</script>

<form class="grid gap-2" {...edit.enhance(({ submit }) => save(submit))}>
	<input {...edit.fields.id.as("hidden", message.id)} />
	{#each mentions as id, i (id)}
		<input {...edit.fields.mentions[i].as("hidden", id)} />
	{/each}
	<div class="relative">
		<ChatMentionPicker bind:this={picker} {songId} {sessionId} {box} bind:draft bind:picked />
		<!-- svelte-ignore a11y_autofocus -->
		<textarea
			bind:this={box}
			class="field w-full text-15px"
			rows="2"
			maxlength={CHAT_MESSAGE_MAX}
			aria-label="Edit message"
			autofocus
			bind:value={draft}
			{...edit.fields.body.as("text", message.body)}
			{...picker?.boxAria()}
			oninput={() => picker?.update()}
			{onkeydown}></textarea>
	</div>
	<div class="flex gap-2 text-12px">
		<button class="button button-xs" disabled={!!edit.pending || !draft.trim()}
			>{edit.pending ? "Saving…" : "Save"}</button
		>
		<button class="button button-xs" type="button" onclick={onclose}>Cancel</button>
	</div>
</form>
