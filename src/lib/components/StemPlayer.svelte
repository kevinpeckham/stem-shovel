<script lang="ts">
	import { StemEngine } from "$lib/audio/engine.svelte";
	import type { StemManifest, StemState } from "$lib/audio/types";
	import StemRow from "$lib/components/StemRow.svelte";
	import Transport from "$lib/components/Transport.svelte";
	import { formatBytes } from "$lib/format";
	import { untrack, type Snippet } from "svelte";

	interface Props {
		manifest: StemManifest;
		/** Shown under the error message; tells the user where the URLs come from. */
		errorHint?: Snippet;
		/** Per-row actions (download, rename, …), rendered at the end of each row. */
		stemMenu?: Snippet<[StemState]>;
		/** Rendered to the right of the "N stems" line (e.g. "Download all"). */
		headerExtras?: Snippet;
	}

	let { manifest, errorHint, stemMenu, headerExtras }: Props = $props();

	const engine = new StemEngine();

	// Effects only run in the browser (no AudioContext during SSR).
	//
	// What is loaded is identified by the stems' ids + urls, not the manifest
	// object: a refreshed load (after a rename, a settings save…) hands us a new
	// object with the same stems, which must not re-decode 70 MB files. Three
	// cases: nothing loaded yet or a stem added/replaced → full load; only
	// stems removed → engine.remove each; labels changed → engine.relabel.
	// load() reads the engine's own $state synchronously, so the calls are in
	// untrack() — otherwise they would become dependencies and re-run the
	// effect mid-decode. The teardown releases the context on navigation away.
	let loadedKeys = new Map<string, string>(); // id → url of what the engine holds
	$effect(() => {
		const stems = manifest.stems;
		untrack(() => {
			const nextKeys = new Map(stems.map((s) => [s.id, s.url]));
			const sameOrFewer =
				loadedKeys.size > 0 && [...nextKeys].every(([id, url]) => loadedKeys.get(id) === url);
			if (sameOrFewer) {
				for (const id of loadedKeys.keys()) if (!nextKeys.has(id)) engine.remove(id);
				for (const s of stems) engine.relabel(s.id, s.label);
			} else {
				void engine.load(stems);
			}
			loadedKeys = nextKeys;
		});
	});
	$effect(() => () => engine.dispose());
</script>

<div class="flex flex-wrap items-baseline justify-between gap-4">
	<p class="text-sm text-dim">
		{manifest.stems.length}
		{manifest.stems.length === 1 ? "stem" : "stems"}{#if engine.status === "ready"}, {formatBytes(
				engine.decodedBytes,
			)} decoded in memory{/if}
	</p>
	{#if headerExtras}
		{@render headerExtras()}
	{/if}
</div>

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
			<StemRow {stem} {engine} menu={stemMenu} />
		{/each}
	</section>

	<p class="mt-6 text-xs text-dim">
		Space plays and pauses. Click a waveform to seek. Focus a row and press M or S.
	</p>
{/if}
