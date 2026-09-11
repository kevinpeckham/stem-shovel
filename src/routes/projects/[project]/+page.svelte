<script lang="ts">
	import { enhance } from "$app/forms";
	import { formatTime } from "$lib/format";

	let { data, form } = $props();
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
	</header>

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
