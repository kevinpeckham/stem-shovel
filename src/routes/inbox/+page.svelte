<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { formatDate } from "$lib/utils/formatDate";
	import { markAllNotificationsRead, markNotificationRead } from "$lib/remote/notifications.remote";
	import { goto, invalidateAll } from "$app/navigation";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";

	let { data } = $props();
	let unread = $derived(data.items.filter((i) => !i.readAt).length);
	let busy = $state(false);

	const ICON: Record<string, string> = {
		"storage-limit": "i-ph-hard-drives",
		"seats-full": "i-ph-users-three",
		"invitation-accepted": "i-ph-hand-waving",
		comment: "i-ph-chat-circle-text",
		stems: "i-ph-waveform",
		song: "i-ph-music-notes-plus",
		demo: "i-ph-microphone",
	};
	const when = (d: Date) =>
		`${formatDate(d)} ${d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).toLowerCase()}`;

	/** Opening an item reads it and goes where it points. */
	async function open(item: (typeof data.items)[number]) {
		try {
			if (!item.readAt) await markNotificationRead({ id: item.id });
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
		await goto(item.href || "/inbox", { invalidateAll: true });
	}
	async function readAll() {
		busy = true;
		try {
			await markAllNotificationsRead({});
			await invalidateAll();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			busy = false;
		}
	}
</script>

<svelte:head>
	<title>{pageTitle("Inbox")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article flex flex-wrap items-baseline justify-between gap-4">
		<div>
			<h1 class="heading-2">Inbox</h1>
			<p class="opacity-90 text-balance">
				What happened in your projects: comments, new stems, songs and demos, invitations accepted,
				and warnings about an account's limits.
				<a class="link-dim" href="/settings/notifications">Choose what reaches your email.</a>
			</p>
		</div>
		{#if unread > 0}
			<button class="button button-sm" type="button" disabled={busy} onclick={readAll}>
				Mark all as read
			</button>
		{/if}
	</header>

	<section class="max-w-article">
		{#if data.items.length === 0}
			<p
				class="rounded border border-dashed border-white/15 px-4 py-6 text-center text-sm opacity-90"
			>
				Nothing yet. Comments, uploads and warnings from your projects will land here.
			</p>
		{:else}
			<ul class="surface divide-y divide-white/10 text-15px" aria-label="Notifications">
				{#each data.items as item (item.id)}
					<li>
						<button
							class="grid w-full grid-cols-[auto_1fr_auto] items-start gap-x-4 px-5 py-3 text-left hover:bg-white/5 {item.readAt
								? 'opacity-70'
								: ''}"
							type="button"
							onclick={() => open(item)}
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
								<span class="block text-12px opacity-60">{when(item.updatedAt)}</span>
							</span>
							{#if !item.readAt}
								<span class="mt-2 h-2 w-2 rounded-full bg-accent" aria-label="Unread"></span>
							{/if}
						</button>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
