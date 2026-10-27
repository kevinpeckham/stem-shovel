<script lang="ts">
	import type { DashboardEntry } from "#lib/constants/dashboardLinks.js";

	/**
	 * The dashboard's "Worth a look" (docs/dashboard-plan.md, step 5): the
	 * practice nudges across the person's accounts, oldest first, each a
	 * link to the song or the Idea Recorder with the reason under it (a
	 * song nobody has changed in a month, a chart with no recording yet, an
	 * idea with no take yet). Rendered only with something in it.
	 */
	let { items }: { items: DashboardEntry[] } = $props();
</script>

{#if items.length > 0}
	<section class="surface grid gap-3 p-5" aria-labelledby="dashboard-nudges">
		<h2 class="marketing-section-heading mb-0" id="dashboard-nudges">Worth a look</h2>
		<ul class="grid gap-2 text-15px" aria-label="Worth a look">
			{#each items as item (item.id)}
				<li class="min-w-0">
					<a class="link" href={item.href}>{item.title || "Untitled"}</a>
					<div class="text-12px opacity-70">{item.meta}</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
