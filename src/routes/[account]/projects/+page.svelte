<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import { createProject } from "$lib/remote/projects.remote";
	import { clearForm } from "$lib/utils/clearForm";

	let { data } = $props();

	// The form keeps the last name across navigations (it redirects to the
	// new project); start each visit empty.
	$effect(() => clearForm(createProject));
</script>

<svelte:head>
	<title>{pageTitle("Projects")}</title>
</svelte:head>

<main class="page-x-padding pt-6">
	<header class="flex flex-wrap items-baseline justify-start gap-4 mb-2">
		<h1 class="heading-2">{data.account.name}</h1>
	</header>

	<div class="mb-2 flex flex-wrap justify-between"><h2 class="heading-3">Projects</h2></div>
	{#if data.projects.length === 0}
		<p class="text-dim">No projects yet.</p>
	{:else}
		<!-- <p class="opacity-90 mb-3 text-15px">Select a project to view or edit.</p> -->
		<ul class="grid grid-cols-1 gap-4">
			{#each data.projects as project (project.id)}
				<li>
					<a class="list-tile" href="/{data.account.slug}/projects/{project.slug}"
						>{#if project.isPrivate}<span
								class="i-ph-lock mr-1 inline-block align-[-2px] opacity-70"
								title="Private"
								aria-label="Private"
							></span>{/if}{project.name}</a
					>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.archived.length > 0}
		<details class="mt-6">
			<summary class="cursor-pointer text-15px opacity-80 hover:opacity-100">
				Archived ({data.archived.length})
			</summary>
			<ul class="mt-3 grid grid-cols-1 gap-3">
				{#each data.archived as project (project.id)}
					<li>
						<a
							class="list-tile flex justify-between items-baseline opacity-70 hover-opacity-100"
							href="/{data.account.slug}/projects/{project.slug}"
						>
							<span>{project.name}</span>
							<span class="text-sm">archived · open to restore</span>
						</a>
					</li>
				{/each}
			</ul>
		</details>
	{/if}

	{#if data.canEdit}
		<h2 class="mt-8 heading-3 mb-2">Start New Project</h2>
		<form class="" {...createProject}>
			<div class="grid grid-cols-[1fr_auto] w-full gap-3">
				<input {...createProject.fields.accountId.as("hidden", data.account.id)} />
				<label class="grow">
					<!-- <div class="heading-3 mb-2">New Project</div> -->
					<input
						class="border px-3 py-2 border-current/40 rounded-md bg-blue-300/5 w-full text-20px"
						{...createProject.fields.name.as("text")}
						placeholder="Name of Project …"
						required
					/>
				</label>
				<button class="button button-sm h-full button-accent" disabled={!!createProject.pending}>
					<span class="i-ph-plus"></span>
					<span>Create</span></button
				>
			</div>
		</form>
		{#each createProject.fields.name.issues() ?? [] as issue (issue.message)}
			<p class="mt-2 text-sm text-red-400">{issue.message}</p>
		{/each}
	{/if}
</main>
