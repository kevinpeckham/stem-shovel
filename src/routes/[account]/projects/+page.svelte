<script lang="ts">
	import { createProject } from "$lib/remote/projects.remote";
	import { clearForm } from "$lib/utils/clearForm";

	let { data } = $props();

	// The form keeps the last name across navigations (it redirects to the
	// new project); start each visit empty.
	$effect(() => clearForm(createProject));
</script>

<svelte:head>
	<title>Projects — Stem Shovel</title>
</svelte:head>

<main class="page-x-padding pt-6">
	<header class="flex flex-wrap items-baseline justify-start gap-4 mb-2">
		<h1 class="heading-1">{data.account.name}</h1>
	</header>

	<h2 class="opacity-90 text-15px mb-2">Projects</h2>
	{#if data.projects.length === 0}
		<p class="text-dim">No projects yet.</p>
	{:else}
		<ul class="grid grid-cols-1 gap-4">
			{#each data.projects as project (project.id)}
				<li>
					<a class="list-tile" href="/{data.account.slug}/projects/{project.slug}">{project.name}</a
					>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.canEdit}
		<form class="mt-8 flex items-end gap-3" {...createProject}>
			<input {...createProject.fields.accountId.as("hidden", data.account.id)} />
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
			<p class="mt-2 text-sm text-red-400">{issue.message}</p>
		{/each}
	{/if}
</main>
