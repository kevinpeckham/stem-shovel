<script lang="ts">
	import { invalidateAll } from "$app/navigation";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import LocationNew from "#lib/components/LocationNew.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * The account's practice locations: a tile each linking to the
	 * location's page, with how many practices are on the calendar there,
	 * and New location (LocationNew).
	 */
	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle(`Practice locations · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<h1 class="app-page-heading mb-0 flex items-center gap-2">
				Practice locations
				<InfoTip
					text="Where the band rehearses: a name, the address and notes, saved once and picked for every practice there. Locations belong to your account."
					label="About locations"
					class="text-16px"
				/>
			</h1>
			{#if data.canEdit}
				<button
					class="button button-sm button-accent ml-auto"
					type="button"
					popovertarget="location-new-page"
				>
					<span class="i-ph-plus" aria-hidden="true"></span> New location
				</button>
			{/if}
		</div>
	</header>

	<div class="max-w-article">
		{#if data.locations.length === 0}
			<div class="surface p-6">
				<p class="mb-2 font-700">No locations yet.</p>
				<p class="text-14px text-dim">
					Press New location, or pick one on a practice and it appears here.
				</p>
			</div>
		{:else}
			<ul class="grid gap-3" aria-label="Practice locations">
				{#each data.locations as l (l.id)}
					<li>
						<a class="app-list-tile block" href="/{data.account.slug}/practice-locations/{l.id}">
							<span class="app-tile-heading">{l.name}</span>
							{#if l.eventCount > 0}
								<span class="mt-1 block text-13px text-dim">{l.eventCount} on the calendar</span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</div>
</main>

{#if data.canEdit}
	<LocationNew
		id="location-new-page"
		accountId={data.account.id}
		onadded={() => void invalidateAll()}
	/>
{/if}
