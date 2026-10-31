<script lang="ts">
	import { POSITION_PLACEHOLDER, type SongChanges } from "#lib/state/songChanges.svelte.js";
	import type { SongSections } from "#lib/state/songSections.svelte.js";

	/**
	 * The song settings' Sections tab: Detect, Place from chart and Add row
	 * across the top, the offered answer's card, then the rows of name and
	 * start. The name is the section's only identifier (it matches the
	 * chart's `## Name` headings); the timeline abbreviates it. The state is
	 * the page's (SongSections in src/lib/state).
	 */
	interface Props {
		/** The section rows, the detection and the chart placement. */
		sections: SongSections;
		/** The position helpers every editor shares (editPos, the readout mode). */
		changes: SongChanges;
		/** The song has a chart the AI can read with the mix. */
		hasScore: boolean;
		/** Whether the AI is at hand for this song. */
		aiAvailable: boolean;
	}

	let { sections, changes, hasScore, aiAvailable }: Props = $props();
</script>

{#snippet actions()}
	<div class="flex flex-wrap items-center gap-2 [&>button]:whitespace-nowrap">
		{#if aiAvailable}
			<button
				class="button button-xs"
				type="button"
				disabled={sections.busy}
				title={hasScore
					? "Send the mix and the chart to a model that marks where each section begins"
					: "Send the mix to a model that listens and marks where each section begins"}
				onclick={sections.detect}
			>
				<span class="i-ph-sparkle" aria-hidden="true"></span>
				{sections.busy && sections.source === "ai" ? "Listening…" : "Detect"}
			</button>
		{/if}
		{#if hasScore}
			<button
				class="button button-xs"
				type="button"
				disabled={sections.busy}
				title="Place the chart's sections in the recording by aligning the chart to the stems (no AI)"
				onclick={sections.placeFromChart}
			>
				<span class="i-ph-music-notes" aria-hidden="true"></span>
				{sections.busy && sections.source === "chart" ? "Placing…" : "Place from chart"}
			</button>
		{/if}
		<button class="button button-xs" type="button" onclick={sections.add}>
			<span class="i-ph-plus" aria-hidden="true"></span>
			Add row
		</button>
	</div>
{/snippet}

{#snippet answerCard()}
	{#if sections.answer}
		<p class="mt-2 rounded bg-white/5 px-3 py-2 text-sm">
			{sections.source === "chart"
				? "Aligned to the recording, the chart places"
				: hasScore
					? "The AI read the chart and listened. It finds"
					: "AI hears"}
			<strong
				>{sections.answer.sections
					.map((s) => `${s.name} at ${changes.editPos(s.at)}`)
					.join(", ")}</strong
			>
			{sections.answer.notes ? ` — ${sections.answer.notes}` : ""}
			<button
				class="ml-2 link"
				type="button"
				disabled={sections.saving}
				onclick={sections.useAnswer}>{sections.saving ? "Saving…" : "Use these"}</button
			>
			<button class="ml-2 link" type="button" onclick={() => (sections.answer = null)}
				>Dismiss</button
			>
		</p>
	{/if}
{/snippet}

{#snippet rows()}
	{#if sections.rows.length > 0}
		<div class="mt-3 grid gap-2">
			{#each sections.rows as row, i (i)}
				<!-- Two lines on a phone (name, then start + remove), one from sm up. -->
				<div
					class="mb-2 grid grid-cols-[1fr_auto] items-center gap-2 sm:mb-0 sm:grid-cols-[1fr_7rem_auto]"
				>
					<input
						class="field col-span-2 sm:col-span-1"
						placeholder="Intro"
						bind:value={row.name}
						aria-label="Section name"
					/>
					<input
						class="field font-mono text-sm"
						placeholder={POSITION_PLACEHOLDER[changes.mode]}
						bind:value={row.time}
						aria-label="Start time"
					/>
					<button
						class="link text-xs justify-self-start"
						type="button"
						onclick={() => sections.remove(i)}>Remove</button
					>
				</div>
			{/each}
		</div>
	{/if}
{/snippet}

<div>
	<div class="flex flex-wrap items-center justify-between gap-3">
		<h3 class="text-15px font-700">Sections</h3>
		{@render actions()}
	</div>
	<p class="mt-1 text-sm opacity-90">
		Song structure for the timeline above the stems: a name, which matches the chart's section
		headings, and where it starts — time, timecode or bars. The timeline abbreviates the name; the
		full name shows on hover.
	</p>
	{@render answerCard()}
	{@render rows()}
	{#if sections.error}
		<p class="mt-2 text-sm text-red-400" role="alert">{sections.error}</p>
	{/if}
	<div class="mt-3 flex items-center gap-3">
		<button
			class="button-accent disabled:opacity-40"
			type="button"
			disabled={sections.saving}
			onclick={sections.save}
		>
			{sections.saving ? "Saving…" : "Save sections"}
		</button>
		<button class="link text-xs" type="button" onclick={sections.reset}>Discard changes</button>
	</div>
</div>
