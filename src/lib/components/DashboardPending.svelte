<script lang="ts">
	import type { DashboardEntry } from "#lib/constants/dashboardLinks.js";

	/**
	 * The dashboard's "In progress" (docs/dashboard-plan.md, step 3): what
	 * the server has not finished across the person's accounts, oldest
	 * first (an upload not completed, a playback rendition pending or
	 * failed, a stem mix or notes transcription in flight, a notation PDF
	 * not made yet), each linking to where it lives, so a member knows why
	 * something is not there yet. The entry's `meta` says the state and
	 * the thing; `whenText` says since when. Rendered only with something in it.
	 */
	let { items }: { items: DashboardEntry[] } = $props();
</script>

{#if items.length > 0}
	<section class="surface grid gap-3 p-5" aria-labelledby="dashboard-pending">
		<h2 class="marketing-section-heading mb-0" id="dashboard-pending">In progress</h2>
		<ul class="grid gap-2 text-15px" aria-label="Work in progress">
			{#each items as item (item.id)}
				<li class="min-w-0">
					<a class="link" href={item.href}>{item.title || "Untitled"}</a>
					<div class="text-12px opacity-70">{item.meta} · since {item.whenText}</div>
				</li>
			{/each}
		</ul>
	</section>
{/if}
