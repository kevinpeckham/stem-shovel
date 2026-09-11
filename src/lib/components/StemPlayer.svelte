<script lang="ts">
	import { StemEngine } from "$lib/audio/engine.svelte";
	import type { StemManifest } from "$lib/audio/types";
	import StemRow from "$lib/components/StemRow.svelte";
	import Transport from "$lib/components/Transport.svelte";
	import { formatBytes } from "$lib/format";
	import { untrack, type Snippet } from "svelte";

	interface Props {
		manifest: StemManifest;
		/** Shown under the error message; tells the user where the URLs come from. */
		errorHint?: Snippet;
	}

	let { manifest, errorHint }: Props = $props();

	const engine = new StemEngine();

	// Effects only run in the browser (no AudioContext during SSR).
	// The only dependency we want is `manifest` — so this reloads if the route's
	// data changes (e.g. navigating between songs on the same page component).
	// The load call itself is wrapped in untrack(): load() reads the engine's
	// own $state synchronously, and letting those become dependencies would
	// re-run the effect mid-decode and dispose the context.
	// The teardown releases the context on navigation away or before a reload.
	$effect(() => {
		const stems = manifest.stems;
		untrack(() => void engine.load(stems));
		return () => engine.dispose();
	});
</script>

<p class="text-sm text-dim">
	{manifest.stems.length} stems{#if engine.status === "ready"}, {formatBytes(engine.decodedBytes)} decoded
		in memory{/if}
</p>

{#if engine.status === "loading"}
	<p class="mt-6 text-dim" aria-live="polite">
		Decoding stem {Math.min(engine.loaded + 1, engine.total)} of {engine.total}…
	</p>
{:else if engine.status === "error"}
	<div class="mt-6 surface p-4">
		<p class="font-medium">Couldn't load the stems.</p>
		<p class="mt-1 text-sm text-dim">{engine.error}</p>
		{#if errorHint}
			<p class="mt-3 text-sm">{@render errorHint()}</p>
		{/if}
	</div>
{:else if engine.status === "ready"}
	<div class="mt-6 surface px-4 py-3">
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
