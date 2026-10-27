<script lang="ts">
	import type { InboxDigest } from "#lib/utils/inboxDigest.js";
	import { kindLabel } from "#lib/utils/kindLabel.js";
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

	/** The dashboard's "Latest": unread inbox items counted per kind, and the newest of them. */
	let { digest }: { digest: InboxDigest<Item> } = $props();
	let line = $derived(digest.byKind.map((k) => kindLabel(k.kind, k.count)).join(" · "));
</script>

<section aria-labelledby="dashboard-new">
	<h2 class="marketing-section-heading" id="dashboard-new">Latest</h2>
	{#if digest.unread > 0}
		<p class="mb-3 text-15px opacity-90">{line}</p>
		<ul class="surface divide-y divide-white/10 text-15px" aria-label="Unread notifications">
			{#each digest.newest as item (item.id)}
				<li><InboxItem {item} /></li>
			{/each}
		</ul>
		<p class="mt-3 text-14px"><a class="link" href="/inbox">All notifications</a></p>
	{:else}
		<p class="text-14px text-dim opacity-80">Nothing new since your last visit.</p>
	{/if}
</section>
