<script lang="ts">
	import { enhance } from "$app/forms";
	import { formatTime } from "$lib/format";
	import { slugify } from "$lib/slug";
	import { updateProject } from "$lib/remote/projects.remote";

	let { data, form } = $props();

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

<main class="mx-auto max-w-4xl px-4 py-8">
	<header class="mb-6 flex items-baseline justify-between gap-4">
		<div>
			<a class="text-sm text-dim underline underline-offset-4" href="/projects">Projects</a>
			<h1 class="text-xl font-semibold">{data.project.name}</h1>
		</div>
		<button
			class="text-sm text-dim underline underline-offset-4"
			type="button"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			{open ? "Close settings" : "Settings"}
		</button>
	</header>

	{#if open}
		<form
			class="mb-8 rounded-lg bg-row px-4 py-4"
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
						class="mt-1 block w-full rounded border border-line bg-panel px-3 py-2"
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
					<span class="mt-1 flex items-center rounded border border-line bg-panel">
						<span class="pl-3 text-sm text-dim">/projects/</span>
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
							class="mt-1 text-xs text-dim underline underline-offset-4"
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
					class="rounded bg-ink px-4 py-2 text-panel disabled:opacity-40"
					disabled={!dirty || !!updateProject.pending}
				>
					{updateProject.pending ? "Saving…" : "Save"}
				</button>
			</div>
		</form>
	{:else if saved}
		<p class="mb-6 text-sm text-dim">Saved.</p>
	{/if}

	{#if data.project.songs.length === 0}
		<p class="text-dim">No songs yet.</p>
	{:else}
		<ul class="divide-y divide-line rounded-lg bg-row">
			{#each data.project.songs as song (song.id)}
				{@const ready = song.stems.filter((s) => s.status === "ready").length}
				<li>
					<a
						class="flex items-baseline justify-between gap-4 px-4 py-3 hover:underline"
						href="/projects/{data.project.slug}/{song.slug}"
					>
						<span>{song.title}</span>
						<span class="shrink-0 text-sm text-dim">
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

	<form class="mt-8 flex items-end gap-3" method="POST" action="?/createSong" use:enhance>
		<label class="grow">
			<span class="text-sm text-dim">New song</span>
			<input
				class="mt-1 block w-full rounded border border-line bg-row px-3 py-2"
				name="title"
				type="text"
				placeholder="Song title"
				value={form?.title ?? ""}
				required
			/>
		</label>
		<button class="rounded bg-ink px-4 py-2 text-panel">Create</button>
	</form>
	{#if form?.error}
		<p class="mt-2 text-sm text-solo">{form.error}</p>
	{/if}
</main>
