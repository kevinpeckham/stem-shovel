<script lang="ts">
	import SessionsTable from "#lib/components/SessionsTable.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/** Your Sessions: every recording session across the person's accounts, sortable and filterable. */
	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Sessions")}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="app-page-heading">Your Sessions</h1>
		<p class="opacity-90 text-balance">
			Every practice and show recorded in the accounts you belong to. Sort by a column, or search
			and pick a kind to narrow the list.
		</p>
	</header>

	{#if data.sessions.length === 0}
		<p class="opacity-90">
			No sessions yet.
			{#if data.currentSlug}
				<a class="link" href="/{data.currentSlug}/sessions/record">Record a session</a>
			{/if}
		</p>
	{:else}
		<SessionsTable sessions={data.sessions} />
	{/if}
</main>
