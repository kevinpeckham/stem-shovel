<script lang="ts">
	import { markNotificationRead } from "#lib/remote/notifications.remote.js";
	import { goto } from "$app/navigation";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { formatWhen } from "#lib/utils/formatWhen.js";

	/** One inbox notification as a row (the inbox and the dashboard): opening it reads it and goes where it points. */
	interface Props {
		item: {
			id: string;
			kind: string;
			priority: string;
			title: string;
			body: string;
			href: string | null;
			readAt: Date | null;
			updatedAt: Date;
		};
	}
	let { item }: Props = $props();

	const ICON: Record<string, string> = {
		"storage-limit": "i-ph-hard-drives",
		"seats-full": "i-ph-users-three",
		"invitation-accepted": "i-ph-hand-waving",
		comment: "i-ph-hands-clapping-bold",
		chat: "i-ph-chat-circle-dots",
		mention: "i-ph-at",
		stems: "i-ph-waveform",
		song: "i-ph-music-notes-plus",
		demo: "i-ph-microphone",
		mix: "i-ph-waveform",
		session: "i-ph-cassette-tape",
	};

	async function open() {
		try {
			if (!item.readAt) await markNotificationRead({ id: item.id });
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
		await goto(item.href || "/inbox", { refreshAll: true });
	}
</script>

<button
	class="grid w-full grid-cols-[auto_1fr_auto] items-start gap-x-4 px-5 py-3 text-left hover:bg-white/5 {item.readAt
		? 'opacity-70'
		: ''}"
	type="button"
	onclick={open}
>
	<span
		class="{ICON[item.kind] ?? 'i-ph-bell'} mt-1 text-18px {item.priority === 'high'
			? 'text-accent'
			: 'opacity-80'}"
		aria-hidden="true"
	></span>
	<span class="min-w-0">
		<span class="block font-600 {item.readAt ? '' : 'text-white'}">
			{item.title}
			{#if item.priority === "high"}
				<span
					class="ml-2 rounded border border-accent/60 px-1.5 py-0.5 text-10px uppercase tracking-wider text-accent"
					>Important</span
				>
			{/if}
		</span>
		<span class="block text-sm opacity-90">{item.body}</span>
		<span class="block text-12px opacity-60">{formatWhen(item.updatedAt)}</span>
	</span>
	{#if !item.readAt}
		<span class="mt-2 h-2 w-2 rounded-full bg-accent" aria-label="Unread"></span>
	{/if}
</button>
