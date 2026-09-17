<script lang="ts">
	import { applyLocalMix, loadLocalMix, saveLocalMix, snapshotLocalMix } from "$lib/audio/localMix";
	import { StemEngine } from "$lib/audio/engine.svelte";
	import type { StemManifest, StemState } from "$lib/audio/types";
	import StemRow from "$lib/components/StemRow.svelte";
	import Transport from "$lib/components/Transport.svelte";
	import { formatBytes } from "$lib/utils/formatBytes";
	import type { MidiSummary } from "$lib/audio/midi";
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
		/** Stems showing their MIDI piano roll instead of the waveform, by stem id. */
		midiViews?: Record<string, MidiSummary>;
		/** Ctrl / ⌘-click or right-click on a row's waveform or roll. */
		onstemcontext?: (stem: StemState, seconds: number, x: number, y: number) => void;
		/** Rendered after the last stem row, inside the stems section (the comment timeline). */
		afterRows?: Snippet;
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
		/** When given, the listener's fader/mute/solo/master changes persist in this browser (localMix). */
		songId?: string;
	}

	let {
		manifest,
		errorHint,
		stemMenu,
		stemBadge,
		midiViews = {},
		onstemcontext,
		afterRows,
		headerExtras,
		sections = [],
		changes = [],
		startAt = null,
		endAt = null,
		fps = 25,
		onaddsection,
		onengine,
		songId,
	}: Props = $props();

	const engine = new StemEngine();
	/** The song's default mix per stem, from the manifest. */
	let defaults = $derived(new Map(manifest.stems.map((s) => [s.id, s.gain ?? 1])));
	/** The listener's own mix differs from the default (there is something to reset). */
	export function hasLocalMix() {
		return !!snapshotLocalMix(engine, defaults);
	}
	/** Back to the song's default mix, and forget the local one. */
	export function resetMix() {
		applyLocalMix(engine, null, defaults);
		if (songId) saveLocalMix(songId, null);
	}
	/** After a member saved the current faders as the default: they are the default now, nothing local left. */
	export function forgetLocalMix() {
		if (songId) saveLocalMix(songId, null);
	}
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
				// load() sets up the stems synchronously; the listener's own mix goes on top of the default.
				if (songId) {
					const local = loadLocalMix(songId);
					if (local) applyLocalMix(engine, local, defaults);
				}
			}
			loadedKeys = nextKeys;
		});
	});
	// Persist the listener's mix as it changes (nothing stored when it equals the default).
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!songId) return;
		const id = songId;
		const snapshot = snapshotLocalMix(engine, defaults);
		untrack(() => {
			if (engine.status !== "ready" && engine.status !== "loading") return;
			if (saveTimer) clearTimeout(saveTimer);
			saveTimer = setTimeout(() => saveLocalMix(id, snapshot), 300);
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
		<Transport {engine} {changes} grid={barGrid(changes, startAt)} {endAt} {fps} />
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
			<StemRow
				{stem}
				{engine}
				menu={stemMenu}
				badge={stemBadge}
				roll={midiViews[stem.id] ?? null}
				oncontext={onstemcontext}
			/>
		{/each}
		{#if afterRows}{@render afterRows()}{/if}
	</section>

	<div
		class="mt-3 border border-current/40 rounded-md px-3 py-2 flex items-center gap-2 text-16px lg-text-13px opacity-90 bg-blue-300/5"
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
