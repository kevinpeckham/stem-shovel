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
	<header class="flex flex-wrap items-center justify-start gap-4 mb-5">
		{#if data.account.imageUrl}
			<img
				class="h-14 w-14 rounded-md border border-white/15 object-cover"
				src={data.account.imageUrl}
				alt=""
			/>
		{/if}
		<h1 class="app-page-heading mb-2">{data.account.name}</h1>
	</header>

	<section class="mt-10">
		<h2 class="app-section-heading">Projects</h2>
		{#if data.projects.length === 0}
			<p class="text-dim">No projects yet.</p>
		{:else}
			<p class="app-section-subheading mb-4">Select a project to view or edit.</p>
			<ul class="grid grid-cols-1 gap-4">
				{#each data.projects as project (project.id)}
					<li>
						<a class="app-list-tile" href="/{data.account.slug}/projects/{project.slug}"
							>{#if project.imageUrl}<img
									class="mr-3 inline-block h-9 w-9 rounded border border-white/15 object-cover align-middle"
									src={project.imageUrl}
									alt=""
								/>{/if}

							<div class="app-tile-heading">
								{#if project.isPrivate}
									<span
										class="i-ph-lock flex bg-accent opacity-70"
										title="Private"
										aria-label="Private"
									></span>
								{/if}

								{project.name}
							</div>
						</a>
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
	</section>

	{#if data.canEdit}
		<section class="mt-10">
			<h2 class="app-section-heading">Start New Project</h2>
			<p class="app-section-subheading mb-4">Create a new project.</p>
			<form class="" {...createProject}>
				<div class="grid grid-cols-[1fr_auto] w-full gap-3">
					<input {...createProject.fields.accountId.as("hidden", data.account.id)} />
					<label class="grow">
						<div class="sr-only">New Project Name</div>
						<input
							class="app-input-field-lg"
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
		</section>
	{/if}
</main>
