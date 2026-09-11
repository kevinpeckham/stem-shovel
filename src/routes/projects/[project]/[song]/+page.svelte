<script lang="ts">
	import { enhance } from "$app/forms";
	import StemPlayer from "$lib/components/StemPlayer.svelte";
	import StemUploader from "$lib/components/StemUploader.svelte";
	import { formatBytes } from "$lib/format";

	let { data } = $props();
	let deleting = $state(false);

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
		</div>
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
