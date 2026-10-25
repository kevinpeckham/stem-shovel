<script lang="ts">
	import ChatMentionPicker from "#lib/components/ChatMentionPicker.svelte";
	import { sendMessage } from "#lib/remote/chat.remote.js";
	import type { ChatMessageRow } from "#lib/server/data.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { clearForm } from "#lib/utils/clearForm.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { mentionsIn } from "#lib/utils/mentionsIn.js";
	import { CHAT_MESSAGE_MAX } from "#lib/val/ChatSchema.js";

	/**
	 * The chat's composer (docs/chat.md): a box and a Send button. Enter
	 * sends, Shift+Enter breaks a line; `@` opens the people picker
	 * (ChatMentionPicker), and the people picked whose `@Name` is still in
	 * the text go with the message as its mentions. The box clears after a
	 * send and keeps its text on an error (shown as a notification). The
	 * sent message, as the server made it, goes to the parent (`onsent`).
	 */
	interface Props {
		/** The chat's song, or its session (docs/chat.md "Sessions"): one of them. */
		songId?: string;
		sessionId?: string;
		/** What the box asks for; "song" by default. */
		about?: string;
		onsent: (message: ChatMessageRow) => void;
	}
	let { songId = "", sessionId = "", about = "song", onsent }: Props = $props();

	let draft = $state("");
	let box = $state<HTMLTextAreaElement | null>(null);
	let picked = $state<{ id: string; name: string }[]>([]);
	let picker = $state<ReturnType<typeof ChatMentionPicker>>();
	let mentions = $derived(mentionsIn(draft, picked));
	function onkeydown(e: KeyboardEvent) {
		if (picker?.keydown(e)) return;
		if (e.key === "Enter" && !e.shiftKey && !e.isComposing) {
			e.preventDefault();
			if (draft.trim()) box?.form?.requestSubmit();
		}
	}
	async function send(submit: () => Promise<unknown>, element: HTMLFormElement) {
		try {
			await submit();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
			return;
		}
		if (sendMessage.fields.allIssues()) return;
		const r = sendMessage.result;
		if (r?.message) onsent(r.message);
		element.reset();
		clearForm(sendMessage);
		draft = "";
		picked = [];
		box?.focus();
	}
</script>

<form
	class="border-t border-current/20 px-4 py-3"
	{...sendMessage.enhance(({ submit, element }) => send(submit, element))}
>
	<input {...sendMessage.fields.songId.as("hidden", songId)} />
	<input {...sendMessage.fields.sessionId.as("hidden", sessionId)} />
	{#each mentions as id, i (id)}
		<input {...sendMessage.fields.mentions[i].as("hidden", id)} />
	{/each}
	<div class="grid grid-cols-[1fr_auto] items-end gap-2">
		<div class="relative">
			<ChatMentionPicker bind:this={picker} {songId} {sessionId} {box} bind:draft bind:picked />
			<textarea
				bind:this={box}
				class="field w-full text-15px"
				rows="2"
				maxlength={CHAT_MESSAGE_MAX}
				placeholder="Say something about this {about}… (Enter sends, Shift+Enter for a new line, @ to mention)"
				aria-label="Message"
				bind:value={draft}
				{...sendMessage.fields.body.as("text")}
				{...picker?.boxAria()}
				oninput={() => picker?.update()}
				{onkeydown}></textarea>
		</div>
		<button
			class="button button-xs"
			aria-label="Send"
			title="Send (Enter)"
			disabled={!!sendMessage.pending || !draft.trim()}
		>
			<span class="i-ph-paper-plane-right text-14px" aria-hidden="true"></span>
		</button>
	</div>
	{#each sendMessage.fields.body.issues() ?? [] as issue (issue.message)}
		<p class="mt-1 text-12px text-red-300">{issue.message}</p>
	{/each}
</form>
