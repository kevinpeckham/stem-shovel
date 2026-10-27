<script lang="ts">
	import { DASHBOARD_IDEAS_PAGE } from "#lib/constants/dashboardLinks.js";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import DashboardIdeaList from "./DashboardIdeaList.svelte";

	/**
	 * The person's ideas of one kind on the dashboard (Your ideas, Your
	 * loops, Your multitrack recordings), newest first, each a link into the
	 * tool that made it, with a link to the tool and a search by title;
	 * with none, a card that sends them there.
	 */
	interface Props {
		id: string;
		heading: string;
		ideas: { id: string; title: string; createdAt: Date }[];
		href: (id: string) => string;
		empty: string;
		action: { label: string; href: string };
		all: { label: string; href: string };
		search: string;
	}
	let { id, heading, ideas, href, empty, action, all, search }: Props = $props();

	let query = $state("");
	/** Pages of DASHBOARD_IDEAS_PAGE shown; back to one whenever the query changes. */
	let pages = $state(1);
	let matches = $derived(filterByTitle(ideas, query));
</script>

<section class="grid gap-3" aria-labelledby={id}>
	<div class="flex items-baseline justify-between gap-4">
		<h2 class="heading-2 mb-0" {id}>{heading}</h2>
		{#if ideas.length > 0}
			<a class="link-dim text-14px" href={all.href}>{all.label}</a>
		{/if}
	</div>
	{#if ideas.length === 0}
		<div class="surface grid justify-items-start gap-3 p-5">
			<p class="text-15px opacity-90">{empty}</p>
			<a class="button-accent button-sm" href={action.href}>{action.label}</a>
		</div>
	{:else}
		<label class="relative w-full sm-w-72">
			<span
				class="i-ph-magnifying-glass pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim"
				aria-hidden="true"
			></span>
			<input
				class="field w-full py-1 pl-7 text-13px"
				type="search"
				placeholder="Search by title"
				aria-label={search}
				bind:value={query}
				oninput={() => (pages = 1)}
			/>
		</label>
		<DashboardIdeaList
			{heading}
			ideas={matches}
			{href}
			shown={pages * DASHBOARD_IDEAS_PAGE}
			onmore={() => (pages += 1)}
		/>
	{/if}
</section>
