<script lang="ts">
	import type { Snippet } from "svelte";
	import type { TimingMap } from "@barmark/sync";
	import { refreshAll } from "$app/navigation";
	import {
		clearChartTiming,
		setChartTimingUse,
		useChartlessGrid,
	} from "#lib/remote/songs.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { errorMessage } from "#lib/utils/errorMessage.js";
	import { timingMapLine } from "#lib/utils/timingMapLine.js";
	import { chartlessPlacementLine } from "#lib/utils/chartlessPlacementLine.js";
	import { chartlessGridUse } from "#lib/utils/chartlessGridUse.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import type { ChartlessGrid } from "#lib/audio/chartlessGrid.js";
	import { chordChart, type ChordSegment } from "#lib/audio/chords.js";
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import { barGrid, barSecondsAt, type BarGrid } from "#lib/audio/measures.js";
	import { SONG_CHANGE_KINDS, SONG_CHANGE_LABELS } from "#lib/constants/songChanges.js";
	import { MAIN_ONLY } from "#lib/constants/arrangements.js";
	import ArrangementSettingsLine from "#lib/components/ArrangementSettingsLine.svelte";
	import ArrangementSpanForm from "#lib/components/ArrangementSpanForm.svelte";
	import type { SongCheck } from "#lib/state/songCheck.svelte.js";
	import type { SongChordDraft } from "#lib/state/songChordDraft.svelte.js";
	import { POSITION_PLACEHOLDER, type SongChanges } from "#lib/state/songChanges.svelte.js";
	import { chordsByBarSummary } from "#lib/utils/chordsByBarSummary.js";
	import type { PlacedAnswer } from "#lib/utils/placeAnswerByAlignment.js";
	import type { SongChange } from "#lib/val/SongChangeSchema.js";

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
		/** The song, for its chart timing map and whether the player follows it. */
		songId: string;
		timing: TimingMap | null;
		useTiming: boolean;
		/** The song's saved tempo, key and time signature changes and its start: the declared bar the timing map is set beside. */
		savedChanges: SongChange[];
		startAt: number | null;
		/** The song's start of bar 1 was just set from the stems: the Details tab's entry should show it. */
		onstartset?: () => void;
		/** The player shows an alternate arrangement: Scan stems and Detect chords read and write Main's until phase 3 (docs/arrangements.md). */
		onAlternate?: boolean;
		/** The alternate shown (null for Main): its settings line, its own start and end, and where "Use as start of bar 1" writes. */
		arrangementId?: string | null;
		/** The alternate has settings of its own (docs/arrangements.md, "Settings of its own"); `startAt` and `endAt` are then its own. */
		settingsOwn?: boolean;
		endAt?: number | null;
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
		songId,
		timing,
		useTiming,
		savedChanges,
		startAt,
		onstartset,
		onAlternate = false,
		arrangementId = null,
		settingsOwn = false,
		endAt = null,
	}: Props = $props();

	/** The declared grid's bar at the start (the song's tempo and meter, not the followed map). */
	let declared = $derived.by(() => {
		const declaredGrid = barGrid(savedChanges, startAt);
		return declaredGrid ? { barSeconds: barSecondsAt(declaredGrid, startAt ?? 0) } : null;
	});

	/** Why Scan stems cannot run now (an alternate arrangement, stems still decoding), null when it can. */
	let scanBlocked = $derived(
		onAlternate
			? MAIN_ONLY
			: engine?.status !== "ready"
				? "Available once every stem has decoded"
				: null,
	);

	let timingBusy = $state(false);
	/**
	 * Runs a Bar timing action, then the page's data again so the grid
	 * follows; `done` is the notification, or makes it from the action's
	 * result once the data is fresh.
	 */
	async function timingAction<T>(run: () => Promise<T>, done: string | ((result: T) => string)) {
		timingBusy = true;
		try {
			const result = await run();
			await refreshAll();
			notify(typeof done === "string" ? done : done(result));
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		} finally {
			timingBusy = false;
		}
	}
	const follow = (use: boolean) =>
		timingAction(
			() => setChartTimingUse({ id: songId, use }),
			use ? "Following the chart's timing" : "Back to the song's own tempo",
		);
	/** The placement's bar one and tempo become the song's start of bar 1 and tempo; the rows show the new tempo. */
	const usePlacement = (placement: ChartlessGrid) =>
		timingAction(
			() => useChartlessGrid({ id: songId, arrangementId, ...chartlessGridUse(placement) }),
			({ startAt: at, bpm }) => {
				changes.reset();
				onstartset?.();
				// Time, not a position: in bars the new start is "1 | 1" by definition.
				return `Start of bar 1 set to ${formatTime(at)}, tempo ${bpm} bpm`;
			},
		);
	const forget = () => {
		if (!confirm("Forget the chart's timing map? The player goes back to the song's own tempo."))
			return;
		void timingAction(() => clearChartTiming({ id: songId }), "Timing map forgotten");
	};
</script>

<div>
	{#if arrangementId}
		<ArrangementSettingsLine {arrangementId} own={settingsOwn} onreset={changes.reset} />
	{/if}
	{@render actionsRow()}
	{#if onAlternate}
		<p class="mt-1 text-sm text-dim">
			Scan stems and Detect chords read the Main arrangement's stems: switch to Main to use them.
		</p>
	{/if}
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
	{#if arrangementId}
		<!-- Remounted when the arrangement gains or drops settings of its own, so the entries show what is in force. -->
		{#key settingsOwn}
			<ArrangementSpanForm {arrangementId} span={{ startAt, endAt }} {changes} {engine} />
		{/key}
	{/if}
	{@render barTiming()}
</div>

<!-- The chart's timing map: what it holds, and whether the player's bars follow it. -->
{#snippet barTiming()}
	<div class="mt-5 border-t border-current/20 pt-3" data-chart-timing>
		<h3 class="text-15px font-700">Bar timing</h3>
		{#if settingsOwn}
			<p class="mt-1 text-sm opacity-90">
				This arrangement counts bars on its own tempo and start of bar 1. The chart's timing map was
				made for the Main arrangement's recording.
			</p>
		{:else}
			<p class="mt-1 text-sm opacity-90">{timingMapLine(timing, declared)}</p>
		{/if}
		{#if timing && !settingsOwn}
			<div class="mt-2 flex flex-wrap items-center gap-3">
				<button
					class="button button-xs"
					type="button"
					disabled={timingBusy}
					aria-pressed={useTiming}
					title={useTiming
						? "The readout, the click and the sections count bars on the map; stop to go back to the song's own tempo"
						: "Count bars on the map: the readout, the click and the sections follow the recording's own bar lines"}
					onclick={() => follow(!useTiming)}
				>
					<span class={useTiming ? "i-ph-check" : "i-ph-metronome"} aria-hidden="true"></span>
					{useTiming ? "Following · Stop" : "Follow it"}
				</button>
				<button class="link text-xs" type="button" disabled={timingBusy} onclick={forget}
					>Forget</button
				>
			</div>
		{/if}
	</div>
{/snippet}

<!-- Scan stems, Detect chords (and Cancel), Ask AI to check, Add change. -->
{#snippet actionsRow()}
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h3 class="text-15px font-700">Tempo, key and time signature</h3>
		<div class="flex flex-wrap items-center gap-2 [&>button]:whitespace-nowrap">
			<button
				class="button button-xs"
				type="button"
				disabled={!!scanBlocked || check.scanning}
				title={scanBlocked ??
					(hasScore && aiAvailable
						? "The song has a chart: the AI reads it and listens to the mix for its keys, and for tempo and time signature where the chart marks them"
						: "Listen to the loaded stems for tempo, key and time signature")}
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
					disabled={check.aiBusy || !hasScore || onAlternate}
					title={onAlternate
						? MAIN_ONLY
						: hasScore
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
			{#if chordDraft.chordSource === "model"}
				Read from the mix by the chord model: on a real recording it names about three bars in four
				right. It spells roots and plain chords only, never a power chord or a slash bass, so check
				the colors against your ears before you draft or save.
			{:else}
				A rough read: on a real recording about half the bars come out right, so check these against
				your ears before you draft or save.
			{/if}
		</p>
		<pre class="mt-2 whitespace-pre-wrap font-mono text-12px opacity-90">{chordChart(
				segments,
			)}</pre>
		{#if chordDraft.placement}
			{@const placement = chordDraft.placement}
			<p class="mt-1 text-xs opacity-80">
				{chartlessPlacementLine(placement)}
				<button
					class="ml-2 link"
					type="button"
					disabled={timingBusy}
					title="Set the song's start of bar 1 and tempo to what the stems say"
					onclick={() => usePlacement(placement)}>Use as start of bar 1</button
				>
			</p>
		{:else if chordDraft.placementRefusal}
			{@const refusalLine = chartlessPlacementLine(null, chordDraft.placementRefusal)}
			{#if refusalLine}<p class="mt-1 text-xs opacity-80">{refusalLine}</p>{/if}
		{/if}
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
			{@const units = changes.unitLabels(row)}
			<!-- Two lines on a phone (time + kind, value + unit + remove), one from sm up. -->
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
				<div class="col-span-2 flex gap-2 sm:col-span-1">
					<input
						class="field min-w-0 flex-1 font-mono text-sm"
						placeholder={row.kind === "tempo" ? "120" : row.kind === "key" ? "F#m" : "4/4"}
						list={row.kind === "meter" ? "time-signatures" : undefined}
						autocomplete="off"
						bind:value={row.value}
						aria-label="Value"
					/>
					{#if units}<select
							class="field w-auto flex-none text-sm"
							bind:value={row.unit}
							aria-label="Tempo unit"
						>
							<option value="bottom">{units.bottom}</option>
							<option value="dotted">{units.dotted}</option>
						</select>{/if}
				</div>
				<button
					class="link-dim text-xs justify-self-start"
					type="button"
					onclick={() => changes.remove(i)}>Remove</button
				>
			</div>
		{/each}
	</div>
	{#if changes.unitHint}<p class="mt-1 text-sm text-dim">{changes.unitHint}</p>{/if}
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
		disabled={onAlternate ||
			!!chordDraft.chordBusy ||
			!engine ||
			engine.status !== "ready" ||
			!grid}
		title={onAlternate
			? MAIN_ONLY
			: !grid
				? "Needs a tempo and a time signature first"
				: "Read a chord per bar from the mix with the chord model, or from the transcribed stems when there is no mix yet"}
		onclick={() => chordDraft.detectChords()}
	>
		<span class="i-ph-music-notes" aria-hidden="true"></span>
		{chordDraft.chordBusy ?? "Detect chords"}
	</button>
	{#if chordDraft.chordBusy || chordDraft.draftBusy}
		<button class="button button-xs" type="button" onclick={chordDraft.cancelDraft}>Cancel</button>
	{/if}
{/snippet}
