<script lang="ts">
	import ChatComposer from "#lib/components/ChatComposer.svelte";
	import ChatRun from "#lib/components/ChatRun.svelte";
	import { chatSince, markChatRead } from "#lib/remote/chat.remote.js";
	import type { ChatMessageRow } from "#lib/server/data.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { groupChat } from "#lib/utils/groupChat.js";
	import { onMount, tick } from "svelte";

	/**
	 * A song's chat (docs/chat.md): the messages oldest first, grouped by
	 * day and by author (groupChat, each run a ChatRun), a "New" line above
	 * the first message the reader has not seen, and the composer
	 * (ChatComposer) at the bottom. While mounted and the page is visible,
	 * the chat polls for what changed and marks itself read as others'
	 * messages arrive; the "New" line stays where it was when the chat was
	 * opened. The messages and the read mark are the page's (bound), so
	 * closing and reopening the panel keeps them.
	 */
	interface Props {
		songId: string;
		messages: ChatMessageRow[];
		readAt: number | null;
		/** The signed-in person, who may edit their own messages. */
		me: { id: string; name: string } | null;
		/** An owner or admin of the account may delete anyone's message. */
		isAdmin?: boolean;
		canWrite?: boolean;
		onseek?: (seconds: number) => void;
		/** How often to ask for changes, in ms; 0 never (tests). */
		pollMs?: number;
	}
	let {
		songId,
		messages = $bindable(),
		readAt = $bindable(),
		me,
		isAdmin = false,
		canWrite = false,
		onseek,
		pollMs = 10_000,
	}: Props = $props();

	// The mark as it stood when the chat was opened: the "New" line keeps its place while this view lasts.
	// svelte-ignore state_referenced_locally
	const openedReadAt = readAt;
	let lines = $derived(groupChat(messages, openedReadAt, me?.id ?? null));
	let latest = $derived(messages.reduce((acc, m) => Math.max(acc, m.updatedAt), 0));

	let listEl = $state<HTMLDivElement | null>(null);
	/** Whether the reader is at the bottom, so new messages scroll into view rather than yanking them away from older ones. */
	let stick = true;
	function onscroll() {
		if (!listEl) return;
		stick = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight < 48;
	}
	async function scrollToEnd(force = false) {
		await tick();
		if (listEl && (stick || force)) listEl.scrollTop = listEl.scrollHeight;
	}

	/** Rows from the server folded into the list: a known id is replaced, a new one added, and the order kept. */
	function merge(rows: ChatMessageRow[]) {
		if (rows.length === 0) return;
		const byId = new Map(messages.map((m) => [m.id, m]));
		for (const r of rows) byId.set(r.id, r);
		messages = Array.from(byId.values()).toSorted(
			(a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
		);
	}
	async function sent(message: ChatMessageRow) {
		merge([message]);
		stick = true;
		await scrollToEnd(true);
	}
	const othersPast = (rows: ChatMessageRow[]) =>
		rows.some((m) => m.userId !== me?.id && (readAt === null || m.createdAt > readAt));

	let marking = false;
	async function markRead() {
		if (!me || marking) return;
		marking = true;
		try {
			const r = await markChatRead({ songId });
			readAt = r.readAt;
		} catch (e) {
			console.error("[chat] mark read", e);
		} finally {
			marking = false;
		}
	}

	let polling = false;
	async function poll() {
		if (polling || typeof document === "undefined" || document.hidden) return;
		polling = true;
		try {
			const rows = await chatSince({ songId, after: latest });
			merge(rows);
			if (othersPast(rows)) {
				await scrollToEnd();
				await markRead();
			}
		} catch (e) {
			console.error("[chat] poll", e);
		} finally {
			polling = false;
		}
	}
	function onvisibilitychange() {
		if (!document.hidden) void poll();
	}

	onMount(() => {
		// Open at the "New" line when there is one, else at the end; what is in view is read.
		const marker = listEl?.querySelector("[data-chat-new]");
		if (marker) marker.scrollIntoView({ block: "start" });
		else void scrollToEnd(true);
		if (othersPast(messages)) void markRead();
		if (pollMs > 0) {
			const timer = setInterval(() => void poll(), pollMs);
			return () => clearInterval(timer);
		}
	});

	function dayLabel(ms: number) {
		const d = new Date(ms);
		const today = new Date();
		const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
		const same = (a: Date, b: Date) =>
			a.getFullYear() === b.getFullYear() &&
			a.getMonth() === b.getMonth() &&
			a.getDate() === b.getDate();
		return same(d, today) ? "Today" : same(d, yesterday) ? "Yesterday" : formatDate(d);
	}
</script>

<svelte:document {onvisibilitychange} />

<!-- No landmark of its own: the panel around it (FloatingPanel) is the "Chat" region. -->
<div
	class="flex h-full min-h-full flex-col rounded-md border border-current/40 bg-blue-300/5"
	id="chat"
>
	<div
		bind:this={listEl}
		class="min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-3 max-h-[70vh]"
		{onscroll}
		data-chat-list
	>
		{#if messages.length === 0}
			<p class="opacity-80">
				{canWrite ? "Nothing yet. Say something about this song." : "Nothing in the chat yet."}
			</p>
		{:else}
			<ol class="grid gap-3">
				{#each lines as line (line.id)}
					{#if line.kind === "date"}
						<li
							class="flex items-center gap-3 text-11px uppercase tracking-wider opacity-60"
							role="separator"
						>
							<span class="h-px flex-1 bg-current/30"></span>{dayLabel(line.at)}<span
								class="h-px flex-1 bg-current/30"
							></span>
						</li>
					{:else if line.kind === "new"}
						<li
							class="flex items-center gap-3 text-11px uppercase tracking-wider text-accent"
							role="separator"
							aria-label="New messages"
							data-chat-new
						>
							<span class="h-px flex-1 bg-accent/60"></span>New<span
								class="h-px flex-1 bg-accent/60"
							></span>
						</li>
					{:else}
						<ChatRun
							run={line.run}
							{me}
							{isAdmin}
							{onseek}
							onchange={(changed) => merge([changed])}
							onremove={(id) => (messages = messages.filter((x) => x.id !== id))}
						/>
					{/if}
				{/each}
			</ol>
		{/if}
	</div>
	{#if canWrite && me}
		<ChatComposer {songId} onsent={sent} />
	{/if}
</div>
