<script lang="ts">
	import ChatMessage from "#lib/components/ChatMessage.svelte";
	import type { ChatMessageRow } from "#lib/server/data.js";
	import type { ChatRun } from "#lib/utils/groupChat.js";

	/**
	 * A run of a chat (docs/chat.md): one author's messages within a few
	 * minutes of each other under one name-and-time header (groupChat),
	 * the reader's own name in blue. Each message is a ChatMessage.
	 */
	interface Props {
		run: ChatRun<ChatMessageRow>;
		me: { id: string } | null;
		isAdmin: boolean;
		onseek?: (seconds: number) => void;
		onchange: (message: ChatMessageRow) => void;
		onremove: (id: string) => void;
	}
	let { run, me, isAdmin, onseek, onchange, onremove }: Props = $props();
	let mine = $derived(!!me && run.userId === me.id);
	const clock = (ms: number) =>
		new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
</script>

<li data-chat-run>
	<div class="flex items-baseline gap-2 text-12px">
		<span class="font-600 {mine ? 'text-blue-300' : ''}">{run.authorName}</span>
		<time class="opacity-60" datetime={new Date(run.at).toISOString()}>{clock(run.at)}</time>
	</div>
	<ol class="grid gap-1">
		{#each run.messages as m (m.id)}
			<ChatMessage
				message={m}
				canEdit={mine}
				canDelete={mine || isAdmin}
				{onseek}
				{onchange}
				{onremove}
			/>
		{/each}
	</ol>
</li>
