<script lang="ts">
	import { goto } from "$app/navigation";
	import ComboBox from "#lib/components/ComboBox.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { createProject } from "#lib/remote/projects.remote.js";
	import { clearForm } from "#lib/utils/clearForm.js";

	let { data } = $props();

	/** The user's other accounts, for a switch beside the title (Kevin, 2026-10-20): each one's projects page. */
	const accountOptions = $derived(
		(data.memberships ?? []).map((m) => ({
			value: m.slug,
			label: m.name,
			description: m.actingAs ? "acting as owner" : m.role,
		})),
	);
	const canSwitch = $derived(
		accountOptions.length > 1 && accountOptions.some((o) => o.value === data.account.slug),
	);

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
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<h1 class="app-page-heading">{data.account.name}</h1>
			{#if canSwitch}
				<!-- The combo box's root is full width; a shrink-to-fit wrapper keeps it beside the title. -->
				<div class="w-auto shrink-0">
					<ComboBox
						ariaLabel="Switch account"
						options={accountOptions}
						value={data.account.slug}
						onchange={(slug) => {
							if (slug !== data.account.slug) void goto(`/${slug}/projects`);
						}}
						clearDefaultButtonClasses
						buttonClasses="flex items-center gap-1.5 rounded border border-white/15 bg-white/5 px-2.5 py-1 text-13px hover-bg-white/10 hover-text-accent"
						popoverClasses="text-14px"
					/>
				</div>
			{/if}
		</div>
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
