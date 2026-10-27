<script lang="ts">
	import SongsTable from "#lib/components/SongsTable.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/** Your Songs: every song the person may open across their accounts, sortable and filterable. */
	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Songs")}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="app-page-heading">Your Songs</h1>
		<p class="opacity-90 text-balance">
			Every song you can open, in every project and account you belong to. Sort by a column, or
			search and pick a stage to narrow the list.
		</p>
	</header>

	{#if data.songs.length === 0}
		<p class="opacity-90">
			No songs yet.
			{#if data.currentSlug}
				<a class="link" href="/{data.currentSlug}/projects">Your projects</a>
			{/if}
		</p>
	{:else}
		<SongsTable songs={data.songs} />
	{/if}
</main>
