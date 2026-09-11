<script lang="ts">
	import { StemEngine } from "$lib/audio/engine.svelte";
	import StemRow from "$lib/components/StemRow.svelte";
	import Transport from "$lib/components/Transport.svelte";
	import { formatBytes } from "$lib/format";
	import { untrack } from "svelte";

	let { data } = $props();

	const engine = new StemEngine();

	// Effects only run in the browser (no AudioContext during SSR).
	// The only dependency we want is `data` — so this reloads if the route's
	// data changes (e.g. navigating between songs on the same page component).
	// The load call itself is wrapped in untrack(): load() reads the engine's
	// own $state synchronously, and letting those become dependencies would
	// re-run the effect mid-decode and dispose the context.
	// The teardown releases the context on navigation away or before a reload.
	$effect(() => {
		const stems = data.manifest.stems;
		untrack(() => void engine.load(stems));
		return () => engine.dispose();
	});
</script>

<svelte:head>
	<title>{data.manifest.title} — Stem Shovel</title>
</svelte:head>

<main class="mx-auto max-w-4xl px-4 py-8">
	<header class="mb-6">
		<h1 class="text-xl font-semibold">{data.manifest.title}</h1>
		<p class="text-sm text-dim">
			{data.manifest.stems.length} stems{#if engine.status === "ready"}, {formatBytes(
					engine.decodedBytes,
				)} decoded in memory{/if}
		</p>
	</header>

	{#if engine.status === "loading"}
		<p class="text-dim" aria-live="polite">
			Decoding stem {Math.min(engine.loaded + 1, engine.total)} of {engine.total}…
		</p>
	{:else if engine.status === "error"}
		<div class="rounded border border-line bg-row p-4">
			<p class="font-medium">Couldn't load the stems.</p>
			<p class="mt-1 text-sm text-dim">{engine.error}</p>
			<p class="mt-3 text-sm">
				Check that every <code>url</code> in <code>static/stems/manifest.json</code> points at a
				file that exists, or run <code>bun run stems</code> to generate test audio.
			</p>
		</div>
	{:else if engine.status === "ready"}
		<div class="rounded-lg bg-row px-4 py-3">
			<Transport {engine} />
		</div>

		<section class="mt-4" aria-label="Stems">
			{#each engine.stems as stem (stem.id)}
				<StemRow {stem} {engine} />
			{/each}
		</section>

		<p class="mt-6 text-xs text-dim">
			Space plays and pauses. Click a waveform to seek. Focus a row and press M or S.
		</p>
	{/if}
</main>
