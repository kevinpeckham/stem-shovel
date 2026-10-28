<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import VenueFind from "#lib/components/VenueFind.svelte";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * The account's venues: a search by name or city, a tile each linking to
	 * the venue's page, and New venue (VenueFind: find a shared venue first,
	 * create one only when it is not there yet).
	 */
	let { data } = $props();

	let query = $state("");
	const shown = $derived(
		filterByTitle(
			data.venues.map((v) => ({ ...v, title: v.name, meta: v.city })),
			query,
		),
	);
	const tileLine = (v: { city: string; eventCount: number }) =>
		[v.city.trim(), v.eventCount ? `${v.eventCount} on the calendar` : ""]
			.filter(Boolean)
			.join(" · ");
</script>

<svelte:head>
	<title>{pageTitle(`Venues · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<h1 class="app-page-heading mb-0 flex items-center gap-2">
				Venues
				<InfoTip
					text="A venue is a place you play or rehearse. Venues are shared by every band on Stem Shovel; your notes about one are yours alone."
					label="About venues"
					class="text-16px"
				/>
			</h1>
			{#if data.canEdit}
				<button
					class="button button-sm button-accent ml-auto"
					type="button"
					popovertarget="venue-find-page"
				>
					<span class="i-ph-plus" aria-hidden="true"></span> New venue
				</button>
			{/if}
		</div>
		<p class="mt-3 text-15px opacity-85">
			The places the band plays and rehearses: the address, how to get there and your notes, entered
			once and picked for every show there.
		</p>
	</header>

	{#if data.venues.length === 0}
		<div class="max-w-article surface p-6">
			<p class="mb-2 font-700">No venues yet.</p>
			<p class="text-14px text-dim">
				Press New venue to find a place, or pick one on a show and it appears here.
			</p>
		</div>
	{:else}
		<div class="max-w-article">
			<label class="relative mb-4 block w-full sm-w-72">
				<span class="sr-only">Search venues</span>
				<span
					class="i-ph-magnifying-glass pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim"
					aria-hidden="true"
				></span>
				<input
					class="field w-full py-1 pl-7 text-13px"
					type="search"
					placeholder="Search by name or city"
					aria-label="Search venues"
					bind:value={query}
				/>
			</label>
			{#if shown.length === 0}
				<p class="text-14px text-dim">No venue matches "{query.trim()}".</p>
			{:else}
				<ul class="grid gap-3" aria-label="Venues">
					{#each shown as v (v.id)}
						<li>
							<a class="app-list-tile block" href="/{data.account.slug}/venues/{v.id}">
								<span class="app-tile-heading">{v.name}</span>
								<span class="mt-1 block text-13px text-dim">{tileLine(v)}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</main>

{#if data.canEdit}
	<VenueFind
		id="venue-find-page"
		accountId={data.account.id}
		onadded={() => void invalidateAll()}
	/>
{/if}
