<script lang="ts">
	import ChatText from "#lib/components/ChatText.svelte";
	import type { ProjectChatFeedRow } from "#lib/server/projectChat.js";

	/**
	 * One message in the project's chat feed (ProjectChatFeed.svelte): its
	 * song's title linking to that song's chat, the author (the reader's
	 * own name in blue) and time, the text (ChatText) and an "(edited)" mark.
	 */
	interface Props {
		message: ProjectChatFeedRow;
		href: string;
		mine: boolean;
	}
	let { message, href, mine }: Props = $props();
	const clock = (ms: number) =>
		new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
</script>

<li data-feed-message>
	<div class="flex flex-wrap items-baseline gap-x-2 text-12px">
		<a class="link-dim font-600" {href} title="Open this song's chat">{message.songTitle}</a>
		<span class="font-600" class:text-blue-300={mine}>{message.authorName}</span>
		<time class="opacity-60" datetime={new Date(message.createdAt).toISOString()}
			>{clock(message.createdAt)}</time
		>
	</div>
	<p class="whitespace-pre-wrap break-words text-15px leading-snug">
		<ChatText body={message.body} />
		{#if message.editedAt}<span class="ml-1 text-11px opacity-50">(edited)</span>{/if}
	</p>
</li>
