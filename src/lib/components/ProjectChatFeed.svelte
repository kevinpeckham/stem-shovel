<script lang="ts">
	import ProjectChatFeedItem from "#lib/components/ProjectChatFeedItem.svelte";
	import { projectChatFeed } from "#lib/remote/projectChat.remote.js";
	import type { ProjectChatFeedRow } from "#lib/server/projectChat.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { groupFeed } from "#lib/utils/groupFeed.js";
	import { mergeFeed } from "#lib/utils/mergeFeed.js";
	import { onMount } from "svelte";

	/**
	 * The project page's chat feed (docs/chat.md, "The project page"):
	 * every song's recent messages in one read-only stream, oldest first,
	 * by day (groupFeed), each a ProjectChatFeedItem: its author and time
	 * and its song's title linking to that song's chat. No composer: a conversation lives
	 * on its song. "Load earlier messages" pages back; while mounted and
	 * the page is visible, the newest page is fetched again and folded in
	 * (mergeFeed), so new, edited and deleted messages show.
	 */
	interface Props {
		projectId: string;
		/** The account's and the project's slugs, for the links to each song. */
		account: string;
		project: string;
		/** The signed-in person, whose own name shows in blue. */
		me: { id: string } | null;
		/** How often to fetch the newest page, in ms; 0 never (tests). */
		pollMs?: number;
	}
	let { projectId, account, project, me, pollMs = 15_000 }: Props = $props();

	let messages = $state<ProjectChatFeedRow[]>([]);
	let more = $state(false);
	let loaded = $state(false);
	let failed = $state("");
	let loadingEarlier = $state(false);
	let lines = $derived(groupFeed(messages));
	let notice = $derived(
		!loaded
			? failed || "Loading messages…"
			: messages.length === 0
				? "No messages yet on this project's songs."
				: "",
	);

	/** The newest page, folded into what is held; `more` only from the first, since paging back owns it after. */
	async function refresh() {
		try {
			const page = await projectChatFeed({ projectId });
			messages = mergeFeed(messages, page.messages, page.more);
			if (!loaded) more = page.more;
			loaded = true;
			failed = "";
		} catch (e) {
			if (!loaded) failed = errorMessage(e);
			console.error("[project chat] feed", e);
		}
	}

	async function loadEarlier() {
		const oldest = messages[0];
		if (!oldest || loadingEarlier) return;
		loadingEarlier = true;
		try {
			const page = await projectChatFeed({ projectId, before: oldest.createdAt });
			const held = new Set(messages.map((m) => m.id));
			messages = [...page.messages.filter((m) => !held.has(m.id)).toReversed(), ...messages];
			more = page.more;
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			loadingEarlier = false;
		}
	}

	let polling = false;
	async function poll() {
		if (polling || typeof document === "undefined" || document.hidden) return;
		polling = true;
		await refresh();
		polling = false;
	}
	function onvisibilitychange() {
		if (!document.hidden) void poll();
	}

	onMount(() => {
		void refresh();
		if (pollMs > 0) {
			const timer = setInterval(() => void poll(), pollMs);
			return () => clearInterval(timer);
		}
	});

	const songHref = (m: ProjectChatFeedRow) =>
		`/${account}/projects/${project}/${m.songSlug}?open=chat`;
	function dayLabel(ms: number) {
		const d = new Date(ms);
		const today = new Date();
		const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
		const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
		return same(d, today) ? "Today" : same(d, yesterday) ? "Yesterday" : formatDate(d);
	}
</script>

<svelte:document {onvisibilitychange} />

<div class="flex flex-col rounded-md border border-current/40 bg-blue-300/5" data-project-chat>
	<div class="max-h-[70vh] min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-3">
		{#if notice}<p class="opacity-80">{notice}</p>{/if}
		{#if more}
			<div class="mb-3 flex justify-center">
				<button
					type="button"
					class="link-dim text-13px"
					disabled={loadingEarlier}
					onclick={loadEarlier}>{loadingEarlier ? "Loading…" : "Load earlier messages"}</button
				>
			</div>
		{/if}
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
				{:else}
					<ProjectChatFeedItem
						message={line.message}
						href={songHref(line.message)}
						mine={line.message.userId === me?.id}
					/>
				{/if}
			{/each}
		</ol>
	</div>
	<p class="border-t border-current/20 px-5 py-2 text-12px opacity-70">Reply on the song's chat.</p>
</div>
