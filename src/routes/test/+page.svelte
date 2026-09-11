<script lang="ts">
	import StemPlayer from "$lib/components/StemPlayer.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.manifest.title} — Stem Shovel</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 pt-8 pb-14 sm:px-6">
	<header class="mb-2">
		<h1 class="page-title">{data.manifest.title}</h1>
	</header>

	<StemPlayer manifest={data.manifest}>
		{#snippet errorHint()}
			Check that every <code>url</code> in <code>static/stems/manifest.json</code> points at a file
			that exists, or run <code>bun run stems</code> to generate test audio.
		{/snippet}
	</StemPlayer>
</main>
