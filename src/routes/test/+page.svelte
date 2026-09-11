<script lang="ts">
	import StemPlayer from "$lib/components/StemPlayer.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.manifest.title} — Stem Shovel</title>
</svelte:head>

<main class="page">
	<header>
		<h1 class="display">{data.manifest.title}</h1>
	</header>

	<StemPlayer manifest={data.manifest}>
		{#snippet errorHint()}
			Check that every <code>url</code> in <code>static/stems/manifest.json</code> points at a file
			that exists, or run <code>bun run stems</code> to generate test audio.
		{/snippet}
	</StemPlayer>
</main>
