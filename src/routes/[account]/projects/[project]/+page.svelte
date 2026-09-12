<script lang="ts">
	import { formatTime } from "$lib/format";
	import { slugify } from "$lib/slug";
	import { updateProject } from "$lib/remote/projects.remote";
	import { createSong } from "$lib/remote/songs.remote";

	let { data } = $props();

	let open = $state(false);
	let saved = $state(false);
	const fields = updateProject.fields;

	// Live values: `value()` is undefined until the user edits, so fall back
	// to what the project has now.
	let name = $derived(fields.name.value() ?? data.project.name);
	let slug = $derived(fields.slug.value() ?? data.project.slug);
	let dirty = $derived(name.trim() !== data.project.name || slug.trim() !== data.project.slug);
	// Keep the slug following the name until the slug is edited by hand.
	let slugTouched = $state(false);
</script>

<svelte:head>
	<title>{data.project.name} — Stem Shovel</title>
</svelte:head>

<main class="page-x-padding pt-6 mb-2">
	<header class="flex flex-wrap items-baseline justify-start gap-4">
		<!-- <div class="flex gap-2">
			<a class="text-sm opacity-80 hover-underline underline-offset-4 hover-opacity-100 hover-text-accent" title="back to all projects" href="/{data.account.slug}/projects">Project</a> -->
		<h1 class="heading-1">{data.project.name}</h1>
		<span class="opacity-90 text-15px">a project from {data.account.name}</span>
		<!-- </div> -->
		{#if data.canEdit}
			<button
				class="text-sm link-dim"
				type="button"
				aria-expanded={open}
				onclick={() => (open = !open)}
			>
				{open ? "Close settings" : "Settings"}
			</button>
		{/if}
	</header>

	{#if open}
		<form
			class="mb-8 surface px-4 py-4"
			{...updateProject.enhance(async ({ submit }) => {
				saved = false;
				await submit();
				if (!fields.allIssues()) {
					saved = true;
					open = false;
				}
			})}
		>
			<input {...fields.id.as("hidden", data.project.id)} />
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="text-sm text-dim">Name</span>
					<input
						class="mt-1 field"
						{...fields.name.as("text", data.project.name)}
						oninput={(e) => {
							if (!slugTouched) fields.slug.set(slugify(e.currentTarget.value));
						}}
						required
					/>
					{#each fields.name.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-solo">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-sm text-dim">URL</span>
					<span class="mt-1 flex items-center rounded border border-white/15 bg-black/20">
						<span class="pl-3 text-sm text-dim">/{data.account.slug}/projects/</span>
						<input
							class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
							{...fields.slug.as("text", data.project.slug)}
							oninput={() => (slugTouched = true)}
							required
						/>
					</span>
					{#each fields.slug.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-solo">{issue.message}</p>
					{/each}
					{#if slug !== slugify(name)}
						<button
							class="mt-1 text-xs link-dim"
							type="button"
							onclick={() => {
								fields.slug.set(slugify(name));
								slugTouched = false;
							}}>Use name</button
						>
					{/if}
				</label>
			</div>
			{#if slug.trim() !== data.project.slug}
				<p class="mt-2 text-xs text-dim">
					Changing the URL also moves every song under it. Old links stop working.
				</p>
			{/if}
			<div class="mt-4 flex items-center gap-3">
				<button
					class="button-accent disabled:opacity-40"
					disabled={!dirty || !!updateProject.pending}
				>
					{updateProject.pending ? "Saving…" : "Save"}
				</button>
			</div>
		</form>
	{:else if saved}
		<p class="mb-6 text-sm text-dim">Saved.</p>
	{/if}

	<h2 class="opacity-90 text-16px mb-2">Songs</h2>

	{#if data.project.songs.length === 0}
		<p class="text-dim">No songs yet.</p>
	{:else}
		<ul class="grid grid-cols-1 gap-2">
			{#each data.project.songs as song (song.id)}
				{@const ready = song.stems.filter((s) => s.status === "ready").length}
				<li>
					<a
						class="list-tile flex justify-between items-baseline group"
						href="/{data.account.slug}/projects/{data.project.slug}/{song.slug}"
					>
						<span>
							{song.title}
							{#if song.description}
								<span class="block text-sm">{song.description}</span>
							{/if}
						</span>
						<span class="shrink-0 text-sm opacity-90 text-white font-400 group-hover:opacity-100">
							{ready}
							{ready === 1 ? "stem" : "stems"}{#if song.durationSeconds}, {formatTime(
									song.durationSeconds,
								)}{/if}
						</span>
					</a>
				</li>
			{/each}
		</ul>
	{/if}

	{#if data.canEdit}
		<form class="mt-8 flex items-end gap-3" {...createSong}>
			<input {...createSong.fields.projectId.as("hidden", data.project.id)} />
			<label class="grow">
				<span class="text-sm text-dim">New song</span>
				<input
					class="mt-1 field"
					{...createSong.fields.title.as("text")}
					placeholder="Song title"
					required
				/>
			</label>
			<button class="button-accent" disabled={!!createSong.pending}>Create</button>
		</form>
		{#each createSong.fields.title.issues() ?? [] as issue (issue.message)}
			<p class="mt-2 text-sm text-solo">{issue.message}</p>
		{/each}
	{/if}
</main>
