<script lang="ts">
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { markAllNotificationsRead } from "#lib/remote/notifications.remote.js";
	import { refreshAll } from "$app/navigation";
	import InboxItem from "#lib/components/InboxItem.svelte";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";

	let { data } = $props();
	let unread = $derived(data.items.filter((i) => !i.readAt).length);
	let busy = $state(false);

	async function readAll() {
		busy = true;
		try {
			await markAllNotificationsRead({});
			await refreshAll();
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
						<InboxItem {item} />
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</main>
