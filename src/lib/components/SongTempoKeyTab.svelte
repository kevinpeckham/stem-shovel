<script lang="ts">
	import type { Snippet } from "svelte";
	import { chordChart, type ChordSegment } from "#lib/audio/chords.js";
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import type { BarGrid } from "#lib/audio/measures.js";
	import { SONG_CHANGE_KINDS, SONG_CHANGE_LABELS } from "#lib/constants/songChanges.js";
	import type { SongCheck } from "#lib/state/songCheck.svelte.js";
	import type { SongChordDraft } from "#lib/state/songChordDraft.svelte.js";
	import { POSITION_PLACEHOLDER, type SongChanges } from "#lib/state/songChanges.svelte.js";
	import { chordsByBarSummary } from "#lib/utils/chordsByBarSummary.js";
	import type { PlacedAnswer } from "#lib/utils/placeAnswerByAlignment.js";

	type ScanResult = NonNullable<SongCheck["scanResult"]>;

	/**
	 * The song settings' Tempo & key tab: the scan, the chord detection and
	 * the AI's check across the top, their cards, then the tempo, key and time
	 * signature rows. The state is the page's (SongChanges, SongChordDraft,
	 * SongCheck in src/lib/state), so the Docs panel's draft card shares it.
	 */
	interface Props {
		/** The tempo, key and time signature rows. */
		changes: SongChanges;
		/** Detect chords and the AI's draft from them. */
		chordDraft: SongChordDraft;
		/** Scan stems and the AI's song check. */
		check: SongCheck;
		/** The Stem Player's engine, once it has mounted. */
		engine: StemEngine | null;
		/** The song's bar grid (null without a tempo and a time signature). */
		grid: BarGrid | null;
		/** The song has a chart the AI can read with the mix. */
		hasScore: boolean;
		/** Whether the AI is at hand for this song. */
		aiAvailable: boolean;
		/** AI is off for this song or its project (no Detect chords). */
		noAi: boolean;
		/** The song has a score whose read can be reviewed, and the viewer may edit. */
		canReview: boolean;
		/** Open the chart read for correction. */
		onreview: () => void;
		/** The page's AI draft card (shared with the Docs panel). */
		draftCard: Snippet;
	}

	let {
		changes,
		chordDraft,
		check,
		engine,
		grid,
		hasScore,
		aiAvailable,
		noAi,
		canReview,
		onreview,
		draftCard,
	}: Props = $props();
</script>

<div>
	{@render actionsRow()}
	{#if chordDraft.chordError}<p class="mt-2 text-sm text-red-400" role="alert">
			{chordDraft.chordError}
		</p>{/if}
	{#if chordDraft.chordSegments}{@render chordCard(chordDraft.chordSegments)}{/if}
	{#if chordDraft.draft}{@render draftCard()}{/if}
	{#if check.scanResult}{@render scanCard(check.scanResult)}{/if}
	{#if check.aiAnswer}{@render checkCard(check.aiAnswer)}{/if}
	{#if check.aiError}<p class="mt-2 text-sm text-red-400" role="alert">{check.aiError}</p>{/if}
	<p class="mt-1 text-sm opacity-90">
		Each from the time it starts (0:00.0 for the song's own tempo, key and time signature; later
		rows are changes). They show on the timeline above the stems.
	</p>
	{#if changes.rows.length > 0}{@render rowsEditor()}{/if}
	{#if changes.error}
		<p class="mt-2 text-sm text-red-400" role="alert">{changes.error}</p>
	{/if}
	<div class="mt-3 flex items-center gap-3">
		<button
			class="button-accent disabled:opacity-40"
			type="button"
			disabled={changes.saving}
			onclick={changes.save}
		>
			{changes.saving ? "Saving…" : "Save changes"}
		</button>
		<button class="link-dim text-xs" type="button" onclick={changes.reset}>Discard edits</button>
	</div>
</div>

<!-- Scan stems, Detect chords (and Cancel), Ask AI to check, Add change. -->
{#snippet actionsRow()}
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h3 class="text-15px font-700">Tempo, key and time signature</h3>
		<div class="flex flex-wrap items-center gap-2 [&>button]:whitespace-nowrap">
			<button
				class="button button-xs"
				type="button"
				disabled={check.scanning || !engine || engine.status !== "ready"}
				title={engine?.status !== "ready"
					? "Available once every stem has decoded"
					: hasScore && aiAvailable
						? "The song has a chart: the AI reads it and listens to the mix for its keys, and for tempo and time signature where the chart marks them"
						: "Listen to the loaded stems for tempo, key and time signature"}
				onclick={check.scanStems}
			>
				<span class="i-ph-waveform" aria-hidden="true"></span>
				{check.scanning ? "Scanning…" : "Scan stems"}
			</button>
			{#if !noAi}
				{@render chordActions()}
			{/if}
			{#if aiAvailable}
				<button
					class="button button-xs"
					type="button"
					disabled={check.aiBusy || !hasScore}
					title={hasScore
						? "Send the rendered mix and the chart to a model that reads it beside the recording and places its keys, time signature and tempo marks"
						: "Write the song's chart in the Chart tab, or attach its score (a MusicXML file, or a PDF or image marked as notation), first: the AI reads it beside the mix"}
					onclick={check.askAi}
				>
					<span class="i-ph-sparkle" aria-hidden="true"></span>
					{check.aiBusy ? "Listening…" : "Ask AI to check"}
				</button>
			{/if}
			<button class="button button-xs" type="button" onclick={changes.add}>
				<span class="i-ph-plus" aria-hidden="true"></span>
				Add change
			</button>
		</div>
	</div>
{/snippet}

<!-- The detected chords, a bar each, with the hedge and the AI draft. -->
{#snippet chordCard(segments: ChordSegment[])}
	<div class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<span>{chordsByBarSummary(segments, chordDraft.chordsChecked?.changed ?? null)}</span>
			<span class="flex items-center gap-3">
				{#if aiAvailable}
					<button
						class="link-dim"
						type="button"
						disabled={chordDraft.draftBusy}
						onclick={() => chordDraft.draftFromChords()}
					>
						{chordDraft.draftBusy ? "Drafting…" : "Draft chart with AI"}
					</button>
				{/if}
				<button class="link-dim" type="button" onclick={chordDraft.dismiss}>Dismiss</button>
			</span>
		</div>
		<p class="mt-1 text-12px text-dim">
			A rough read: on a real recording about half the bars come out right, so check these against
			your ears before you draft or save.
		</p>
		<pre class="mt-2 whitespace-pre-wrap font-mono text-12px opacity-90">{chordChart(
				segments,
			)}</pre>
	</div>
{/snippet}

<!-- What the scan found: set, or offered beside the song's own. -->
{#snippet scanCard(result: ScanResult)}
	<p class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
		{#if result.applied}
			Set from the stems: <strong>{result.summary}</strong>{#if result.alternates}<span
					class="ml-1 text-dim">({result.alternates})</span
				>{/if}. Adjust below if the song knows better.
		{:else}
			{#if result.ladder}
				{check.agreementText(result.ladder, result.detection)}
			{/if}
			{#if result.values.length > 0}
				{result.ladder ? "They" : "The stems"} suggest
				<strong>{result.summary}</strong>{#if result.alternates}<span class="ml-1 text-dim"
						>({result.alternates})</span
					>{/if}; the song has {result.current}. Replace?
				<button class="ml-2 link" type="button" onclick={check.replaceFromScan}>Replace</button>
				<button class="ml-2 link" type="button" onclick={() => (check.scanResult = null)}
					>Keep current</button
				>
			{:else}
				<button class="ml-2 link" type="button" onclick={() => (check.scanResult = null)}
					>Dismiss</button
				>
			{/if}
		{/if}
	</p>
{/snippet}

<!-- The AI's song check: its line, any warnings about the chart read, Use these. -->
{#snippet checkCard(answer: PlacedAnswer)}
	<p class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
		The AI read the chart and listened. It finds
		<strong>{check.aiLine(answer)}</strong>{#if answer.tempoChanges.length > 0}
			, then {answer.tempoChanges
				.map((c) => `${Math.round(c.bpm)} bpm at ${changes.editPos(c.at)}`)
				.join(", ")}{/if}{#if answer.keyChanges.length > 0}
			, then {answer.keyChanges.map((c) => `${c.key} at ${changes.editPos(c.at)}`).join(", ")}{/if}
		{answer.notes ? ` — ${answer.notes}` : ""}
		{#if answer.placedByAlignment}
			<span class="ml-1 text-xs opacity-70">placed by alignment</span>
		{/if}
		{#if answer.warnings?.length}
			<!-- The chart read looked wrong (utils/chartReadWarnings.ts): said before the answer is used, with the read a click away. -->
			<span class="mt-1 block text-amber-300" role="alert">
				{#each answer.warnings as w (w)}
					<span class="block"
						><span class="i-ph-warning align-text-bottom" aria-hidden="true"></span>
						{w}</span
					>
				{/each}
				{#if canReview}
					<button class="link-dim" type="button" onclick={onreview}>Review what the AI read</button>
				{/if}
			</span>
		{/if}
		<button
			class="ml-2 link-dim"
			type="button"
			disabled={changes.saving}
			onclick={check.useAiAnswer}>{changes.saving ? "Saving…" : "Use these"}</button
		>
		<button class="ml-2 link-dim" type="button" onclick={() => (check.aiAnswer = null)}
			>Dismiss</button
		>
	</p>
{/snippet}

<!-- The rows: time, kind, value and Remove. -->
{#snippet rowsEditor()}
	<div class="mt-3 grid gap-2">
		{#each changes.rows as row, i (i)}
			<!-- Two lines on a phone (time + kind, value + remove), one from sm up. -->
			<div
				class="mb-2 grid grid-cols-[6rem_1fr_auto] items-center gap-2 sm:mb-0 sm:grid-cols-[6rem_9rem_1fr_auto]"
			>
				<input
					class="field font-mono text-sm"
					placeholder={POSITION_PLACEHOLDER[changes.mode]}
					bind:value={row.time}
					aria-label="Change time"
				/>
				<select
					class="field col-span-2 text-sm sm:col-span-1"
					bind:value={row.kind}
					aria-label="What changes"
				>
					{#each SONG_CHANGE_KINDS as kind (kind)}
						<option value={kind}>{SONG_CHANGE_LABELS[kind]}</option>
					{/each}
				</select>
				<input
					class="field col-span-2 font-mono text-sm sm:col-span-1"
					placeholder={row.kind === "tempo" ? "120" : row.kind === "key" ? "F#m" : "4/4"}
					list={row.kind === "meter" ? "time-signatures" : undefined}
					autocomplete="off"
					bind:value={row.value}
					aria-label="Value"
				/>
				<button
					class="link-dim text-xs justify-self-start"
					type="button"
					onclick={() => changes.remove(i)}>Remove</button
				>
			</div>
		{/each}
	</div>
	<datalist id="time-signatures">
		{#each ["4/4", "3/4", "6/8", "2/4", "5/4", "7/8", "12/8"] as ts (ts)}
			<option value={ts}></option>
		{/each}
	</datalist>
{/snippet}

<!-- Detect chords, and Cancel while it or a draft runs. -->
{#snippet chordActions()}
	<button
		class="button button-xs"
		type="button"
		disabled={!!chordDraft.chordBusy || !engine || engine.status !== "ready" || !grid}
		title={!grid
			? "Needs a tempo and a time signature first"
			: "Transcribe the tonal stems and read a chord per bar (takes a while) — a rough read on real recordings"}
		onclick={() => chordDraft.detectChords()}
	>
		<span class="i-ph-music-notes" aria-hidden="true"></span>
		{chordDraft.chordBusy ?? "Detect chords"}
	</button>
	{#if chordDraft.chordBusy || chordDraft.draftBusy}
		<button class="button button-xs" type="button" onclick={chordDraft.cancelDraft}>Cancel</button>
	{/if}
{/snippet}
