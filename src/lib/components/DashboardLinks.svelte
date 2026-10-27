<script lang="ts">
	import type { DashboardLink } from "#lib/constants/dashboardLinks.js";

	/** A row of button links (the dashboard's quick actions and tools). */
	let { links, label }: { links: DashboardLink[]; label: string } = $props();
</script>

<nav class="flex flex-wrap gap-2" aria-label={label}>
	{#each links as link (link.href + link.label)}
		<a class="button button-sm" href={link.href}>{link.label}</a>
	{/each}
</nav>
