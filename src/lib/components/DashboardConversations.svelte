<script lang="ts">
	import type { Conversation } from "#lib/constants/dashboardLinks.js";
	import { plural } from "#lib/utils/plural.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import InboxItem from "./InboxItem.svelte";

	type Item = {
		id: string;
		kind: string;
		priority: string;
		title: string;
		body: string;
		href: string | null;
		count: number;
		readAt: Date | null;
		updatedAt: Date;
	};

	/**
	 * The dashboard's "Conversations" (docs/dashboard-plan.md, step 2): the
	 * chats with new messages across the person's accounts, newest first,
	 * each opening its chat; and the comments and mentions waiting for them
	 * (their unread comment and mention notifications), each opening where
	 * it was made. "Nothing waiting." when both are empty.
	 */
	let { chats, comments }: { chats: Conversation[]; comments: Item[] } = $props();

	let line = $derived(
		[
			chats.length > 0 ? `${plural(chats.length, "chat")} with new messages` : "",
			comments.length > 0 ? `${plural(comments.length, "comment")} waiting` : "",
		]
			.filter(Boolean)
			.join(" · "),
	);
</script>

<section class="surface grid gap-3 p-5" aria-labelledby="dashboard-conversations">
	<h2 class="marketing-section-heading mb-0" id="dashboard-conversations">Conversations</h2>
	{#if chats.length === 0 && comments.length === 0}
		<p class="text-14px opacity-80">Nothing waiting.</p>
	{:else}
		<p class="text-14px opacity-90">{line}</p>
		{#if chats.length > 0}
			<ul class="grid gap-2 text-15px" aria-label="Chats with new messages">
				{#each chats as chat (chat.id)}
					<li class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<a class="link" href={chat.href}>{chat.title || "Untitled"}</a>
							<div class="text-12px opacity-70">{chat.meta} · {formatDate(chat.latest)}</div>
						</div>
						<span
							class="mt-0.5 inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-11px font-700 leading-none text-oxford"
							aria-label="{chat.unread} new"
							title="{chat.unread} new">{chat.unread > 99 ? "99+" : chat.unread}</span
						>
					</li>
				{/each}
			</ul>
		{/if}
		{#if comments.length > 0}
			<ul class="divide-y divide-white/10 text-15px -mx-5" aria-label="Comments waiting">
				{#each comments as item (item.id)}
					<li><InboxItem {item} /></li>
				{/each}
			</ul>
		{/if}
	{/if}
</section>
