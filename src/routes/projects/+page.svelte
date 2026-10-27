<script lang="ts">
	import ProjectsTable from "#lib/components/ProjectsTable.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/** Your Projects: every project the person may open across their accounts, sortable and filterable. */
	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle("Projects")}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article">
		<h1 class="app-page-heading">Your Projects</h1>
		<p class="opacity-90 text-balance">
			Every project you can open in the accounts you belong to. Sort by a column, or search to
			narrow the list.
		</p>
	</header>

	{#if data.projects.length === 0}
		<p class="opacity-90">
			No projects yet.
			{#if data.currentSlug}
				<a class="link" href="/{data.currentSlug}/projects">Your projects</a>
			{/if}
		</p>
	{:else}
		<ProjectsTable projects={data.projects} />
	{/if}
</main>
