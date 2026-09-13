<script lang="ts">
	import { StemEngine } from "$lib/audio/engine.svelte";
	import type { StemManifest, StemState } from "$lib/audio/types";
	import StemRow from "$lib/components/StemRow.svelte";
	import Transport from "$lib/components/Transport.svelte";
	import { formatBytes } from "$lib/utils/formatBytes";
	import SectionTimeline from "$lib/components/SectionTimeline.svelte";
	import { barGrid, formatPosition } from "$lib/audio/measures";
	import { readoutMode } from "$lib/audio/readout.svelte";
	import { type SongChange } from "$lib/val/SongChangeSchema";
	import { timelineKinds } from "$lib/utils/timelineKinds";
	import type { SongSection } from "$lib/val/SongSectionSchema";
	import { untrack, type Snippet } from "svelte";

	interface Props {
		manifest: StemManifest;
		/** Shown under the error message; tells the user where the URLs come from. */
		errorHint?: Snippet;
		/** Per-row actions (download, rename, …), rendered at the end of each row. */
		stemMenu?: Snippet<[StemState]>;
		stemBadge?: Snippet<[StemState]>;
		/** Rendered to the right of the "N stems" line (e.g. "Download all"). */
		headerExtras?: Snippet<[StemEngine]>;
		/** Song structure; the timeline row shows when there is a section or a change worth a lane (timelineKinds). */
		sections?: SongSection[];
		changes?: SongChange[];
		/** Bar 1 and the song's end, seconds (null = 0 / the last stem). */
		startAt?: number | null;
		endAt?: number | null;
		/** Frame rate for timecode. */
		fps?: number;
		/** When given, members get an "Add section at playhead" button. */
		onaddsection?: (start: number) => void;
		/** Hands the engine to the parent (for controls rendered outside the player, like the mix download). */
		onengine?: (engine: StemEngine) => void;
	}

	let {
		manifest,
		errorHint,
		stemMenu,
		stemBadge,
		headerExtras,
		sections = [],
		changes = [],
		startAt = null,
		endAt = null,
		fps = 25,
		onaddsection,
		onengine,
	}: Props = $props();

	const engine = new StemEngine();
	untrack(() => onengine)?.(engine); // once, at creation: the engine object never changes

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

{#if headerExtras}
	<div class="flex flex-wrap items-baseline justify-between gap-4 mb-4">
		{@render headerExtras(engine)}
	</div>
{/if}

{#if engine.status === "error"}
	<div class="mt-6 p-4">
		<p class="font-medium">Couldn't load the stems.</p>
		<p class="mt-1 text-sm text-dim">{engine.error}</p>
		{#if errorHint}
			<p class="mt-3 text-sm">{@render errorHint()}</p>
		{/if}
	</div>
{:else if engine.status === "loading" || engine.status === "ready"}
	<div class="rounded-md border border-current/40 bg-blue/5 px-4 py-3 mb-5">
		<Transport {engine} grid={barGrid(changes, startAt)} {endAt} {fps} />
		{#if onaddsection}
			<div class="mt-2 flex justify-end">
				<button
					class="button button-xs"
					type="button"
					disabled={engine.status !== "ready"}
					title="Mark a section starting at the current position ({formatPosition(
						readoutMode(!!barGrid(changes, startAt)),
						engine.position,
						{ fps, grid: barGrid(changes, startAt) },
					)})"
					onclick={() => onaddsection(engine.position)}
				>
					<span class="i-ph-bookmark-simple" aria-hidden="true"></span>
					Add section at playhead
				</button>
			</div>
		{/if}
	</div>

	<section
		class="border border-current/40 rounded-md px-4 py-3 bg-blue/5 grid grid-cols-1 place-content-start mb-5"
		aria-label="Stems"
	>
		{#if sections.length > 0 || timelineKinds(changes).length > 0}
			<SectionTimeline {engine} {sections} {changes} {startAt} {endAt} {fps} />
		{/if}
		{#each engine.stems as stem (stem.id)}
			<StemRow {stem} {engine} menu={stemMenu} badge={stemBadge} />
		{/each}
	</section>

	<div
		class="mt-3 border border-current/40 rounded-md px-3 py-2 flex items-center gap-2 text-14px opacity-90 bg-blue-300/5"
		aria-live="polite"
	>
		{#if engine.status === "loading"}
			Decoding stem {Math.min(engine.loaded + 1, engine.total)} of {engine.total}… play and seek
			enable when every stem is ready.
		{:else if engine.status === "ready"}
			{manifest.stems.length}
			{@html manifest.stems.length === 1 ? "stem" : "stems"}{#if engine.status === "ready"}, {formatBytes(
					engine.decodedBytes,
				)} decoded in memory <span class="text-green-300 i-ph-check"></span>{/if}
		{/if}
	</div>
{/if}
