<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Songs — Stem Shovel</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<header class="mb-6 flex items-baseline justify-between gap-4">
		<h1 class="text-xl font-semibold">Songs</h1>
		<a class="text-sm underline decoration-playhead underline-offset-4" href="/upload"
			>Upload stems</a
		>
	</header>

	{#if data.songs.length === 0}
		<p class="text-dim">Nothing in the Blob store yet.</p>
	{:else}
		<ul class="divide-y divide-line rounded-lg bg-row">
			{#each data.songs as song (song.slug)}
				<li>
					<a class="block px-4 py-3 hover:underline" href="/songs/{song.slug}">{song.title}</a>
				</li>
			{/each}
		</ul>
	{/if}
</main>
