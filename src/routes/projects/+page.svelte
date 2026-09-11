<script lang="ts">
	import { createProject } from "$lib/remote/projects.remote";

	let { data } = $props();
</script>

<svelte:head>
	<title>Projects — Stem Shovel</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 pt-8 pb-14 sm:px-6">
	<header class="mb-6 flex items-baseline justify-between gap-4">
		<h1 class="page-title">Projects</h1>
		<span class="text-sm text-dim">{data.account.name}</span>
	</header>

	{#if data.projects.length === 0}
		<p class="text-dim">No projects yet.</p>
	{:else}
		<ul class="divide-y divide-white/10 surface">
			{#each data.projects as project (project.id)}
				<li>
					<a class="block px-4 py-3 hover:underline" href="/projects/{project.slug}"
						>{project.name}</a
					>
				</li>
			{/each}
		</ul>
	{/if}

	<form class="mt-8 flex items-end gap-3" {...createProject}>
		<label class="grow">
			<span class="text-sm text-dim">New project</span>
			<input
				class="mt-1 field"
				{...createProject.fields.name.as("text")}
				placeholder="Album, session, client…"
				required
			/>
		</label>
		<button class="button-accent" disabled={!!createProject.pending}>Create</button>
	</form>
	{#each createProject.fields.name.issues() ?? [] as issue (issue.message)}
		<p class="mt-2 text-sm text-solo">{issue.message}</p>
	{/each}
</main>
