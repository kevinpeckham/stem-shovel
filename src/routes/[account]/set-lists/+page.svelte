<script lang="ts">
	import InfoTip from "#lib/components/InfoTip.svelte";
	import SetListNew from "#lib/components/SetListNew.svelte";
	import { filterByTitle } from "#lib/utils/filterByTitle.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/** The account's set lists (docs/band-plan.md, "Set list"): a search by title, a tile per list carrying its title alone (Kevin's call, 2026-10-28), and a new one. */
	let { data } = $props();

	let query = $state("");
	const shown = $derived(filterByTitle(data.setLists, query));
</script>

<svelte:head>
	<title>{pageTitle(`Set lists · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<h1 class="app-page-heading mb-0 flex items-center gap-2">
				Set lists
				<InfoTip
					text="A set list is what you play, in order: songs from your catalog and free-text lines, each with a note for the night. The show view puts it on a phone on stage."
					label="About set lists"
					class="text-16px"
				/>
			</h1>
			{#if data.canEdit}
				<button
					class="button button-sm button-accent ml-auto"
					type="button"
					popovertarget="new-set-list"
				>
					<span class="i-ph-plus" aria-hidden="true"></span> New set list
				</button>
			{/if}
		</div>
		<p class="mt-3 text-15px opacity-85">
			What the band plays, in order: the songs for a show, the running order of a practice. Every
			member sees them; a viewing link puts one on everyone's phone for the night.
		</p>
	</header>

	{#if data.setLists.length === 0}
		<div class="max-w-article surface p-6">
			<p class="mb-2 font-700">No set lists yet.</p>
			<p class="text-14px text-dim">
				Press New set list, give it a title and add the songs you are going to play.
			</p>
		</div>
	{:else}
		<div class="max-w-article">
			<label class="relative mb-4 block w-full sm-w-72">
				<span class="sr-only">Search set lists</span>
				<span
					class="i-ph-magnifying-glass pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-dim"
					aria-hidden="true"
				></span>
				<input
					class="field w-full py-1 pl-7 text-13px"
					type="search"
					placeholder="Search by title"
					aria-label="Search set lists"
					bind:value={query}
				/>
			</label>
			{#if shown.length === 0}
				<p class="text-14px text-dim">No set list matches "{query.trim()}".</p>
			{:else}
				<ul class="grid gap-3" aria-label="Set lists">
					{#each shown as l (l.id)}
						<li>
							<a class="app-list-tile block" href="/{data.account.slug}/set-lists/{l.id}">
								<span class="app-tile-heading">{l.title}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</div>
	{/if}
</main>

{#if data.canEdit}
	<SetListNew accountId={data.account.id} />
{/if}
