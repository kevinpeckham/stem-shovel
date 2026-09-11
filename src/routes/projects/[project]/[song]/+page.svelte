<script lang="ts">
	import { enhance } from "$app/forms";
	import StemPlayer from "$lib/components/StemPlayer.svelte";
	import StemUploader from "$lib/components/StemUploader.svelte";
	import { formatBytes } from "$lib/format";

	import { slugify } from "$lib/slug";
	import { updateSong } from "$lib/remote/songs.remote";

	let { data } = $props();
	let deleting = $state(false);

	// Settings form (title, URL, description) on the updateSong remote form.
	let settingsOpen = $state(false);
	let settingsSaved = $state(false);
	const fields = updateSong.fields;
	let title = $derived(fields.title.value() ?? data.song.title);
	let slug = $derived(fields.slug.value() ?? data.song.slug);
	let description = $derived(fields.description.value() ?? data.song.description);
	let settingsDirty = $derived(
		title.trim() !== data.song.title ||
			slug.trim() !== data.song.slug ||
			description.trim() !== data.song.description,
	);
	let slugTouched = $state(false);

	let pending = $derived(data.song.stems.filter((s) => s.status !== "ready"));
</script>

<svelte:head>
	<title>{data.song.title} — Stem Shovel</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8" data-song-id={data.song.id}>
	<header class="mb-2 flex items-baseline justify-between gap-4">
		<div>
			<a
				class="text-sm text-dim underline underline-offset-4"
				href="/projects/{data.song.project.slug}">{data.song.project.name}</a
			>
			<h1 class="text-xl font-semibold">{data.song.title}</h1>
			{#if data.song.description}
				<p class="mt-1 max-w-prose text-sm text-dim">{data.song.description}</p>
			{/if}
		</div>
		<button
			class="text-sm text-dim underline underline-offset-4"
			type="button"
			aria-expanded={settingsOpen}
			onclick={() => (settingsOpen = !settingsOpen)}
		>
			{settingsOpen ? "Close settings" : "Settings"}
		</button>
		<form
			method="POST"
			action="?/delete"
			use:enhance={({ cancel }) => {
				if (!confirm(`Delete "${data.song.title}" and all of its stems?`)) {
					cancel();
					return;
				}
				deleting = true;
				return async ({ update }) => {
					await update();
					deleting = false;
				};
			}}
		>
			<button
				class="text-sm text-dim underline underline-offset-4 disabled:opacity-50"
				disabled={deleting}
			>
				{deleting ? "Deleting…" : "Delete song"}
			</button>
		</form>
	</header>

	{#if settingsOpen}
		<form
			class="mb-8 rounded-lg bg-row px-4 py-4"
			{...updateSong.enhance(async ({ submit }) => {
				settingsSaved = false;
				await submit();
				if (!fields.allIssues()) {
					settingsSaved = true;
					settingsOpen = false;
				}
			})}
		>
			<input {...fields.id.as("hidden", data.song.id)} />
			<div class="grid gap-4 sm:grid-cols-2">
				<label class="block">
					<span class="text-sm text-dim">Title</span>
					<input
						class="mt-1 block w-full rounded border border-line bg-panel px-3 py-2"
						{...fields.title.as("text", data.song.title)}
						oninput={(e) => {
							if (!slugTouched) fields.slug.set(slugify(e.currentTarget.value));
						}}
						required
					/>
					{#each fields.title.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-solo">{issue.message}</p>
					{/each}
				</label>
				<label class="block">
					<span class="text-sm text-dim">URL</span>
					<span class="mt-1 flex items-center rounded border border-line bg-panel">
						<span class="truncate pl-3 text-sm text-dim">/projects/{data.song.project.slug}/</span>
						<input
							class="block w-full bg-transparent py-2 pr-3 font-mono text-sm"
							{...fields.slug.as("text", data.song.slug)}
							oninput={() => (slugTouched = true)}
							required
						/>
					</span>
					{#each fields.slug.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-solo">{issue.message}</p>
					{/each}
					{#if slug !== slugify(title)}
						<button
							class="mt-1 text-xs text-dim underline underline-offset-4"
							type="button"
							onclick={() => {
								fields.slug.set(slugify(title));
								slugTouched = false;
							}}>Use title</button
						>
					{/if}
				</label>
				<label class="block sm:col-span-2">
					<span class="text-sm text-dim"
						>Description <span class="opacity-60">(optional)</span></span
					>
					<textarea
						class="mt-1 block w-full rounded border border-line bg-panel px-3 py-2 text-sm"
						rows="3"
						{...fields.description.as("text", data.song.description)}></textarea>
					{#each fields.description.issues() ?? [] as issue (issue.message)}
						<p class="mt-1 text-sm text-solo">{issue.message}</p>
					{/each}
				</label>
			</div>
			{#if slug.trim() !== data.song.slug}
				<p class="mt-2 text-xs text-dim">Changing the URL breaks existing links to this song.</p>
			{/if}
			<div class="mt-4">
				<button
					class="rounded bg-ink px-4 py-2 text-panel disabled:opacity-40"
					disabled={!settingsDirty || !!updateSong.pending}
				>
					{updateSong.pending ? "Saving…" : "Save"}
				</button>
			</div>
		</form>
	{:else if settingsSaved}
		<p class="mb-6 text-sm text-dim">Saved.</p>
	{/if}

	{#if data.manifest.stems.length > 0}
		{#key data.manifest.stems.map((s) => s.id).join()}
			<StemPlayer manifest={data.manifest}>
				{#snippet errorHint()}
					A stem's file is missing from the Blob store. Delete it below and upload it again.
				{/snippet}
			</StemPlayer>
		{/key}
	{:else}
		<p class="text-sm text-dim">No stems yet. Upload some below.</p>
	{/if}

	<section class="mt-8" aria-label="Chart">
		<div class="mb-2 flex items-baseline justify-between gap-4">
			<h2 class="text-sm font-medium">Chart</h2>
			<a
				class="text-sm text-dim underline underline-offset-4"
				href="/projects/{data.song.project.slug}/{data.song.slug}/chart"
			>
				{data.chartHtml ? "Edit chart" : "Add chart"}
			</a>
		</div>
		{#if data.chartHtml}
			<article class="chart-body rounded-lg bg-row px-6 py-4">
				<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
				{@html data.chartHtml}
			</article>
		{:else}
			<p class="text-sm text-dim">No chart yet. Chords, lyrics and arrangement go here.</p>
		{/if}
	</section>

	<section class="mt-8" aria-label="Files">
		<h2 class="mb-2 text-sm font-medium">Files</h2>
		{#if data.song.stems.length === 0}
			<p class="text-sm text-dim">Nothing uploaded.</p>
		{:else}
			<ul class="divide-y divide-line rounded-lg bg-row text-sm">
				{#each data.song.stems as stem (stem.id)}
					<li class="flex items-center justify-between gap-4 px-4 py-2">
						<span class="truncate">
							{stem.label}
							<span class="text-dim">
								· {stem.filename} · {formatBytes(stem.sizeBytes)}
								{#if stem.status !== "ready"}· {stem.status}{/if}
							</span>
						</span>
						<form method="POST" action="?/deleteStem" use:enhance>
							<input type="hidden" name="id" value={stem.id} />
							<button class="shrink-0 text-dim underline underline-offset-4">Remove</button>
						</form>
					</li>
				{/each}
			</ul>
		{/if}
		{#if pending.length > 0}
			<p class="mt-2 text-xs text-dim">
				{pending.length} not ready: an upload that was interrupted. Remove it and upload again.
			</p>
		{/if}
	</section>

	<section class="mt-8" aria-label="Upload">
		<StemUploader songId={data.song.id} stemCount={data.song.stems.length} />
	</section>
</main>
