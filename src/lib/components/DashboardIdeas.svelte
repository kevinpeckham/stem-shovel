<script lang="ts">
	import { DASHBOARD_IDEAS_PAGE, type DashboardEntry } from "#lib/constants/dashboardLinks.js";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import DashboardIdeaList from "./DashboardIdeaList.svelte";
	import InfoTip from "./InfoTip.svelte";

	/**
	 * A list of the person's own things on the dashboard (Your Songs, Your
	 * Ideas, Your Multitrack Recordings, Your Loops), newest first, each a
	 * link to it, with a link to all of them and a search; with none, a card
	 * that sends them where to start.
	 */
	interface Props {
		id: string;
		heading: string;
		ideas: DashboardEntry[];
		empty: string;
		action: { label: string; href: string };
		all: { label: string; href: string };
		search: string;
		/** A sentence on what this kind of thing is, behind an info button beside the heading. */
		tip: string;
	}
	let { id, heading, ideas, empty, action, all, search, tip }: Props = $props();

	let query = $state("");
	/** Pages of DASHBOARD_IDEAS_PAGE shown; back to one whenever the query changes. */
	let pages = $state(1);
	let matches = $derived(filterByTitle(ideas, query));
</script>

<section class="grid gap-3" aria-labelledby={id}>
	<div class="flex items-baseline justify-between gap-4">
		<h2 class="marketing-topic-heading mb-0 flex items-center gap-2" {id}>
			{heading}
			<InfoTip text={tip} label="About {heading}" class="text-16px" />
		</h2>
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
			shown={pages * DASHBOARD_IDEAS_PAGE}
			onmore={() => (pages += 1)}
		/>
	{/if}
</section>
