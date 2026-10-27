<script lang="ts">
	import { DASHBOARD_IDEAS_PAGE } from "#lib/constants/dashboardLinks.js";
	import { formatWhen } from "#lib/utils/formatWhen.js";
	import { pageOf } from "#lib/utils/pageOf.js";

	/** A dashboard section's ideas after the search: the first `shown`, then how many of how many with a Show more button while some remain. */
	interface Props {
		heading: string;
		ideas: { id: string; title: string; createdAt: Date }[];
		href: (id: string) => string;
		shown: number;
		onmore: () => void;
	}
	let { heading, ideas, href, shown, onmore }: Props = $props();

	let page = $derived(pageOf(ideas, shown));
</script>

{#if ideas.length === 0}
	<p class="text-14px opacity-80">Nothing matches.</p>
{:else}
	<ul class="surface divide-y divide-white/10 text-15px" aria-label={heading}>
		{#each page.visible as idea (idea.id)}
			<li class="flex flex-wrap items-baseline justify-between gap-x-4 px-5 py-2">
				<a class="link" href={href(idea.id)}>{idea.title || "Untitled"}</a>
				<span class="text-12px opacity-60">{formatWhen(idea.createdAt)}</span>
			</li>
		{/each}
	</ul>
	{#if page.total > DASHBOARD_IDEAS_PAGE}
		<div class="flex flex-wrap items-center gap-3">
			<p class="text-12px opacity-70">Showing {page.count} of {page.total}</p>
			{#if page.more}
				<button type="button" class="button button-xs" onclick={onmore}>Show more</button>
			{/if}
		</div>
	{/if}
{/if}
