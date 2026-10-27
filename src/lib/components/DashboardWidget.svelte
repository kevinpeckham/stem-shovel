<script lang="ts">
	import type { DashboardAction, DashboardLink } from "#lib/constants/dashboardLinks.js";
	import { shareSite } from "#lib/utils/shareSite.js";

	/** A sidebar widget on the dashboard (Tools, Instruments, More): a heading over a list of links, and the bug report and share buttons styled as links. */
	let { heading, items }: { heading: string; items: (DashboardLink | DashboardAction)[] } =
		$props();
</script>

<section class="surface grid gap-2 p-5" aria-label={heading}>
	<h2 class="heading-3 mb-0">{heading}</h2>
	<ul class="grid gap-1 text-15px">
		{#each items as item (item.label)}
			<li>
				{#if "href" in item}
					<a class="link-dim" href={item.href}>{item.label}</a>
				{:else if item.action === "report"}
					<button type="button" class="link-dim" popovertarget="bug-report">{item.label}</button>
				{:else}
					<button type="button" class="link-dim" onclick={shareSite}>{item.label}</button>
				{/if}
			</li>
		{/each}
	</ul>
</section>
