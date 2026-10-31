<script lang="ts">
	import { formatKhz } from "#lib/utils/formatKhz.js";
	import {
		applyLocalMix,
		loadLocalMix,
		saveLocalMix,
		snapshotLocalMix,
	} from "#lib/audio/localMix.js";
	import { dropIndexAt } from "#lib/utils/dropIndexAt.js";
	import { moveId } from "#lib/utils/moveId.js";
	import { StemEngine } from "#lib/audio/engine.svelte.js";
	import { DeviceKeep } from "#lib/audio/deviceKeep.svelte.js";
	import type { StemManifest, StemState } from "#lib/audio/types.js";
	import StemRow from "#lib/components/StemRow.svelte";
	import PointerMenu from "#lib/components/PointerMenu.svelte";
	import type ContextMenu from "#lib/components/ContextMenu.svelte";
	import MixerStage from "#lib/components/MixerStage.svelte";
	import { stemMixerModel } from "#lib/audio/mixerModel.js";
	import { StemClick } from "#lib/audio/stemClick.svelte.js";
	import Transport from "#lib/components/Transport.svelte";
	import KeepOnDevice from "#lib/components/KeepOnDevice.svelte";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { stemMemoryBudget } from "#lib/utils/stemMemoryBudget.js";
	import type { StemModeChoice, StemStreamingSetting } from "#lib/utils/stemPlaybackMode.js";
	import type { MidiSummary } from "#lib/audio/midi.js";
	import SectionTimeline from "#lib/components/SectionTimeline.svelte";
	import { barGrid, formatPosition } from "#lib/audio/measures.js";
	import { readoutMode } from "#lib/audio/readout.svelte.js";
	import { onMount, tick } from "svelte";
	import { dev } from "$app/env";
	import CQMeasuring from "#lib/components/CQMeasuring.svelte";
	import { type SongChange } from "#lib/val/SongChangeSchema.js";
	import { timelineKinds } from "#lib/utils/timelineKinds.js";
	import { isTextEntry } from "#lib/utils/isTextEntry.js";
	import type { SongSection } from "#lib/val/SongSectionSchema.js";
	import { untrack, type ComponentProps, type Snippet } from "svelte";

	type MenuItems = NonNullable<ComponentProps<typeof ContextMenu>["items"]>;

	interface Props {
		manifest: StemManifest;
		/** Shown under the error message; tells the user where the URLs come from. */
		errorHint?: Snippet;
		/** Per-row actions (download, rename, …), rendered at the end of each row. */
		stemMenu?: Snippet<[StemState]>;
		stemBadge?: Snippet<[StemState]>;
		/** Stems showing their MIDI piano roll instead of the waveform, by stem id. */
		midiViews?: Record<string, MidiSummary>;
		/** Ctrl / ⌘-click or right-click on a row's waveform or roll opens a menu at the pointer with "Seek here"; these items follow it (the song page's "Comment here"). */
		contextItems?: (stem: StemState, seconds: number) => MenuItems;
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
		/** The site's streaming setting (docs/stem-streaming.md); the listener's own choice in this browser wins. */
		streaming?: StemStreamingSetting;
		/** When given, the listener's fader/mute/solo/master changes persist in this browser (localMix). */
		songId?: string;
		/** The line under the rows saying how many stems are decoded; the front page's demo hides it. */
		showStatus?: boolean;
		/** Space and Home drive the transport (Transport.svelte); off when another player on the page has them. */
		keyboard?: boolean;
		/** When given, the rows can be reordered by their grips (a drag, or the arrow keys); called with the stems' ids in the new order once a move is done. */
		onreorder?: (ids: string[]) => void | Promise<void>;
	}

	let {
		manifest,
		errorHint,
		stemMenu,
		stemBadge,
		midiViews = {},
		contextItems,
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
		showStatus = true,
		keyboard = true,
		onreorder,
		streaming = "auto",
	}: Props = $props();

	const engine = new StemEngine();
	/** Where a row was Ctrl / ⌘-clicked or right-clicked, for the menu at the pointer (PointerMenu after the rows). */
	let contextAt = $state<{ stem: StemState; seconds: number; x: number; y: number } | null>(null);
	const contextMenuItems = (c: NonNullable<typeof contextAt>): MenuItems => [
		{
			kind: "notice",
			notice: `${c.stem.label} · ${formatPosition(readoutMode(!!barGrid(changes, startAt)), c.seconds, { fps, grid: barGrid(changes, startAt) })}`,
		},
		{ label: "Seek here", iconClass: "i-ph-skip-forward", action: () => engine.seek(c.seconds) },
		...(contextItems?.(c.stem, c.seconds) ?? []),
	];
	/** Tracks (the rows) or the Stage (docs/visual-mixer.md), remembered in this browser for every player. */
	const VIEW_KEY = "stemshovel.playerView";
	let view = $state<"tracks" | "stage">("tracks");
	// Read after hydration (the server always renders the rows), so the markup matches before it switches.
	onMount(() => {
		try {
			if (localStorage.getItem(VIEW_KEY) === "stage") view = "stage";
		} catch {
			// no storage: the rows
		}
	});
	function setView(v: "tracks" | "stage") {
		view = v;
		try {
			localStorage.setItem(VIEW_KEY, v);
		} catch {
			// no storage: the choice lasts for this page
		}
	}
	const stageModel = stemMixerModel(engine);
	/** The click in time with the stems (stemClick.svelte.ts), on the song's grid when it has one. */
	const click = new StemClick(engine, () => barGrid(changes, startAt));
	/** The song's default mix per stem, from the manifest. */
	let defaults = $derived(new Map(manifest.stems.map((s) => [s.id, s.gain ?? 1])));
	/** The song's default pans, likewise. */
	let defaultPans = $derived(new Map(manifest.stems.map((s) => [s.id, s.pan ?? 0])));
	/**
	 * The rate most of the stems share, and a mark for any at another: they play in time here
	 * (every stem is decoded at the player's rate), but a DAW session built from the downloads
	 * gets one file at an odd rate (docs/multitrack-recorder.md "Sample rates").
	 */
	let commonRate = $derived.by(() => {
		const counts = new Map<number, number>();
		for (const s of manifest.stems)
			if (s.sampleRate) counts.set(s.sampleRate, (counts.get(s.sampleRate) ?? 0) + 1);
		return [...counts.entries()].sort((x, y) => y[1] - x[1])[0]?.[0] ?? null;
	});
	let rateNotes = $derived(
		new Map(
			manifest.stems
				.filter((s) => s.sampleRate && commonRate && s.sampleRate !== commonRate)
				.map((s) => [
					s.id,
					{
						text: `${formatKhz(s.sampleRate!)} kHz`,
						title: `This stem is ${formatKhz(s.sampleRate!)} kHz; the others are ${formatKhz(commonRate!)} kHz. It plays in time here; a DAW session built from the downloads has one file at a different rate.`,
					},
				]),
		),
	);
	/** The listener's own mix differs from the default (there is something to reset). */
	export function hasLocalMix() {
		return !!snapshotLocalMix(engine, defaults, defaultPans);
	}
	/** Back to the song's default mix, and forget the local one. */
	export function resetMix() {
		applyLocalMix(engine, null, defaults, defaultPans);
		if (songId) saveLocalMix(songId, null);
	}
	/** After a member saved the current faders as the default: they are the default now, nothing local left. */
	export function forgetLocalMix() {
		if (songId) saveLocalMix(songId, null);
	}
	untrack(() => onengine)?.(engine); // once, at creation: the engine object never changes
	// A dev-only hook for the browser tests (tests/e2e): the engine's mode, status and position.
	if (dev && typeof window !== "undefined") (window as { __stems?: StemEngine }).__stems = engine;
	if (dev && typeof window !== "undefined") (window as { __click?: StemClick }).__click = click;

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
	// why $effect: loads, relabels or removes the engine's stems as the manifest changes: the engine is an external system, and a same-stems refresh must not re-decode
	$effect(() => {
		const stems = manifest.stems;
		untrack(() => {
			const nextKeys = new Map(stems.map((s) => [s.id, s.url]));
			const sameOrFewer =
				loadedKeys.size > 0 && [...nextKeys].every(([id, url]) => loadedKeys.get(id) === url);
			if (sameOrFewer) {
				for (const id of loadedKeys.keys()) if (!nextKeys.has(id)) engine.remove(id);
				for (const s of stems) {
					engine.relabel(s.id, s.label);
					engine.retint(s.id, s.tint ?? null);
				}
				engine.reorder(stems.map((s) => s.id));
			} else void loadStems(stems, modeChoice());
			loadedKeys = nextKeys;
		});
	});
	// Persist the listener's mix as it changes (nothing stored when it equals the default).
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	// why $effect: persists the listener's mix to localStorage, debounced, as the engine's faders move
	$effect(() => {
		if (!songId) return;
		const id = songId;
		const snapshot = snapshotLocalMix(engine, defaults, defaultPans);
		untrack(() => {
			if (engine.status !== "ready" && engine.status !== "loading") return;
			if (saveTimer) clearTimeout(saveTimer);
			saveTimer = setTimeout(() => saveLocalMix(id, snapshot), 300);
		});
	});
	// why $effect: disposes the audio engine and the click when the player leaves the page
	$effect(() => () => {
		click.dispose();
		engine.dispose();
	});

	// Reordering: a row's grip is dragged up or down the list (pointer events,
	// so touch works and the page does not scroll under it) or moved with the
	// arrow keys; the engine's rows follow live, and the new order is handed
	// to `onreorder` once, when the move is done.
	let rowsEl = $state<HTMLElement | null>(null);
	let dragging = $state<string | null>(null);
	/** The listener's own playback mode for this browser (docs/stem-streaming.md), or auto. */
	const MODE_KEY = "stemshovel.stemMode";
	function modeChoice(): StemModeChoice | null {
		try {
			const v = localStorage.getItem(MODE_KEY);
			return v === "buffered" || v === "streamed" ? v : null;
		} catch {
			return null;
		}
	}
	/** Switch modes and load the stems again the other way (the song page's header calls it too). */
	export function switchMode(to: StemModeChoice) {
		try {
			if (to === "auto") localStorage.removeItem(MODE_KEY);
			else localStorage.setItem(MODE_KEY, to);
		} catch {
			// no storage: the choice lasts for this load
		}
		void loadStems(manifest.stems, to === "auto" ? null : to);
	}
	const keep = new DeviceKeep(engine, () => songId); // "keep on this device" (audio/deviceKeep.svelte.ts)
	/** The "keep on this device" line's props, for a page that draws the player's status itself (the song page hides the box). */
	export function keepProps() {
		return keep.props;
	}
	/** Load the stems, once the keep knows whether the song is kept, with the listener's own mix on top of the default (load() sets up the stems synchronously). */
	const loadStems = (stems: StemManifest["stems"], choice: StemModeChoice | null) =>
		keep.load(() => {
			const loading = engine.load(stems, { choice, site: streaming });
			const local = songId ? loadLocalMix(songId) : null;
			if (local) applyLocalMix(engine, local, defaults, defaultPans);
			engine.clearMixHistory(); // the mix as loaded is the starting point, not a move
			return loading;
		});
	/** ⌘Z / ⌘⇧Z (Ctrl on Windows) undo and redo mix moves from anywhere on the page but a text field, when this player has the keys. */
	function onwindowkeydown(e: KeyboardEvent): void {
		if (!keyboard || e.altKey || !(e.metaKey || e.ctrlKey) || isTextEntry(e.target)) return;
		if (e.key.toLowerCase() !== "z") return;
		if (e.shiftKey ? !engine.canRedoMix : !engine.canUndoMix) return;
		e.preventDefault();
		if (e.shiftKey) engine.redoMix();
		else engine.undoMix();
	}
	/** What this device can be expected to hold decoded (utils/stemMemoryBudget): Chrome says its memory, the rest get the soft gigabyte. */
	const memoryBudget = stemMemoryBudget(
		typeof navigator === "undefined" ? null : (navigator as { deviceMemory?: number }).deviceMemory,
	);
	let orderAtStart: string[] = [];
	const order = () => engine.stems.map((s) => s.id);
	const moveTo = (id: string, index: number) => engine.reorder(moveId(order(), id, index));
	function commit() {
		const ids = order();
		if (ids.some((id, i) => id !== orderAtStart[i])) void onreorder?.(ids);
	}
	function gripDown(e: PointerEvent, id: string) {
		if (e.button !== 0 || !onreorder) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		dragging = id;
		orderAtStart = order();
	}
	function gripMove(e: PointerEvent) {
		if (!dragging || !rowsEl) return;
		const rows = [...rowsEl.querySelectorAll<HTMLElement>("[data-stem-row]")];
		const index = dropIndexAt(
			rows.map((r) => r.getBoundingClientRect()),
			e.clientY,
		);
		const from = order().indexOf(dragging);
		if (from !== index) moveTo(dragging, index);
	}
	function gripUp() {
		if (!dragging) return;
		dragging = null;
		commit();
	}
	function gripKey(e: KeyboardEvent, id: string) {
		if (!onreorder || (e.key !== "ArrowUp" && e.key !== "ArrowDown")) return;
		e.preventDefault();
		const grip = e.currentTarget as HTMLElement;
		const from = order().indexOf(id);
		orderAtStart = order();
		moveTo(id, from + (e.key === "ArrowUp" ? -1 : 1));
		commit();
		// The keyed row moves in the DOM, which blurs the grip; it gets focus back so the next press moves again.
		void tick().then(() => grip.focus({ preventScroll: true }));
	}
</script>

<!-- {#if headerExtras}
	<div class="flex flex-wrap items-baseline justify-between gap-4 mb-4">
		{@render headerExtras(engine)}
	</div>
{/if} -->

<svelte:window onkeydown={onwindowkeydown} />

<div class="@container relative grid grid-cols-1 w-full">
	<!-- Dev only: where the container's breakpoints fall (CQMeasuring renders nothing in production). -->
	<CQMeasuring />
	{#if engine.status === "error"}
		<div class="mt-6 p-4">
			<p class="font-medium">Couldn't load the stems.</p>
			<p class="mt-1 text-sm text-dim">{engine.error}</p>
			{#if errorHint}
				<p class="mt-3 text-sm">{@render errorHint()}</p>
			{/if}
		</div>
	{:else if engine.status === "loading" || engine.status === "ready"}
		{#if engine.lastLoadDied}
			<p
				class="mb-3 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm"
				role="status"
			>
				The last attempt to load this song in this tab did not finish, which usually means the
				browser ran out of memory ({engine.lastLoadDied.stems} stems, about {formatBytes(
					engine.lastLoadDied.bytes,
				)} once decoded). Try it on a computer, or with fewer stems.
			</p>
		{:else if engine.estimatedBytes > memoryBudget}
			<p
				class="mb-3 rounded border border-amber-400/40 bg-amber-400/10 px-3 py-2 text-sm"
				role="status"
			>
				{engine.stems.length} stems, about {formatBytes(engine.estimatedBytes)} once decoded: more than
				this device may have free. If the page goes blank or reloads while loading, try it on a computer.
			</p>
		{/if}
		<div class="rounded-md border border-current/40 bg-blue/5 px-4 py-3 mb-5">
			<Transport
				{engine}
				{changes}
				grid={barGrid(changes, startAt)}
				{endAt}
				{fps}
				{keyboard}
				{click}
			/>
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
			class="border border-current/40 rounded-md px-4 py-3 bg-blue/5 grid grid-cols-1 place-content-start {dragging
				? 'select-none'
				: ''}"
			aria-label="Stems"
			bind:this={rowsEl}
		>
			<!-- Tracks or the Stage (docs/visual-mixer.md): the same engine either way, so switching changes no sound. -->
			<div class="flex justify-end -mt-1 mb-1">
				<span class="inline-flex text-11px" role="group" aria-label="Stems view">
					<button
						class="rounded-l border border-current/40 px-2 py-0.5 {view === 'tracks'
							? 'bg-blue-300 text-dark border-blue-300'
							: 'opacity-80 hover-opacity-100'}"
						type="button"
						aria-pressed={view === "tracks"}
						title="Tracks: a row per stem with its waveform"
						onclick={() => setView("tracks")}>Tracks</button
					>
					<button
						class="rounded-r border border-l-0 border-current/40 px-2 py-0.5 {view === 'stage'
							? 'bg-blue-300 text-dark border-blue-300'
							: 'opacity-80 hover-opacity-100'}"
						type="button"
						aria-pressed={view === "stage"}
						title="Stage: every stem a puck, left to right is pan, up is level"
						onclick={() => setView("stage")}>Stage</button
					>
				</span>
			</div>
			{#if sections.length > 0 || timelineKinds(changes).length > 0}
				<SectionTimeline {engine} {sections} {changes} {startAt} {endAt} {fps} />
			{/if}
			{#if view === "stage"}
				<MixerStage model={stageModel} menu={stemMenu ? stageMenu : undefined} class="my-2" />
			{:else}
				{#each engine.stems as stem, i (stem.id)}
					<StemRow
						{stem}
						{engine}
						{i}
						menu={stemMenu}
						badge={stemBadge}
						note={rateNotes.get(stem.id) ?? null}
						roll={midiViews[stem.id] ?? null}
						oncontext={(stem, seconds, x, y) => (contextAt = { stem, seconds, x, y })}
						handle={onreorder ? grip : undefined}
						dragging={dragging === stem.id}
					/>
				{/each}
			{/if}
			{#if afterRows}{@render afterRows()}{/if}
			<PointerMenu
				at={contextAt}
				items={contextAt ? contextMenuItems(contextAt) : []}
				ariaLabel="Actions at this spot in the stem"
			/>
		</section>

		<div
			class="mt-3 border border-current/40 rounded-md px-3 py-2 flex items-center gap-2 text-16px lg-text-13px opacity-90 bg-blue-300/5 {showStatus
				? ''
				: 'hidden'}"
			aria-live="polite"
		>
			{#if engine.status === "loading"}
				Decoding stem {Math.min(engine.loaded + 1, engine.total)} of {engine.total}… play and seek
				enable when every stem is ready.
			{:else if engine.status === "ready"}
				{manifest.stems.length}
				{manifest.stems.length === 1 ? "stem" : "stems"}{#if engine.mode === "streamed"}, streamed
					(a {Math.round(engine.estimatedBytes / manifest.stems.length / 1024 / 1024)} MB window a stem){#if engine.buffering},
						buffering…{:else}
						<span class="text-green-300 i-ph-check"></span>{/if}
					<button
						class="link-dim ml-2"
						type="button"
						title="Decode every stem into memory instead (instant seeking; about 60 MB per four-minute stereo stem)"
						onclick={() => switchMode("buffered")}>play buffered</button
					>
				{:else}, {formatBytes(engine.decodedBytes)} decoded in memory
					<span class="text-green-300 i-ph-check"></span>
					{#if typeof AudioDecoder !== "undefined"}
						<button
							class="link-dim ml-2"
							type="button"
							title="Decode a window around the playhead instead of the whole song (docs: Streaming)"
							onclick={() => switchMode("streamed")}>stream instead</button
						>
					{/if}
				{/if}
				<KeepOnDevice {...keep.props} />
			{/if}
		</div>
	{/if}
</div>

<!-- The rows' ⋯ menu for the Stage's strip, by stem id. -->
{#snippet stageMenu(id: string)}
	{@const stem = engine.stems.find((s) => s.id === id)}
	{#if stem && stemMenu}{@render stemMenu(stem)}{/if}
{/snippet}

{#snippet grip(stem: StemState)}
	<button
		class="shrink-0 -ml-1 cursor-grab touch-none rounded px-0.5 py-1 opacity-50 hover-opacity-100 focus-visible-opacity-100 {dragging ===
		stem.id
			? 'cursor-grabbing opacity-100'
			: ''}"
		type="button"
		aria-label="Move {stem.label}"
		title="Drag to reorder, or use the arrow keys"
		onpointerdown={(e) => gripDown(e, stem.id)}
		onpointermove={gripMove}
		onpointerup={gripUp}
		onpointercancel={gripUp}
		onkeydown={(e) => gripKey(e, stem.id)}
	>
		<span class="i-ph-dots-six-vertical block text-16px" aria-hidden="true"></span>
	</button>
{/snippet}
