<script lang="ts">
	import type { ChartDraft } from "#lib/state/songChordDraft.svelte.js";
	import { writtenBarsOf } from "#lib/utils/writtenBarsOf.js";

	/** What an AI draft carries besides its chart (the draft card, SongDraftCard.svelte): the chords by bar, the sections, the progressions and the AI's notes, each only when it has content (a score's chart has none). */
	let { draft }: { draft: ChartDraft } = $props();

	/** The model's chords ("D5 % A5 …") as chart lines, four bars each. */
	function aiChordLines(chords: string): string {
		const cells = chords.split(/\s+/).filter(Boolean);
		const lines: string[] = [];
		for (let i = 0; i < cells.length; i += 4)
			lines.push(`| ${cells.slice(i, i + 4).join(" | ")} |`);
		return lines.join("\n");
	}
	/** The draft chart's written bar numbers: a section's `bar` is a play position, and after a repeat the two differ. */
	let written = $derived(writtenBarsOf(draft.chart));
	let sectionsLine = $derived(
		draft.sections.map((s) => `${s.name} @ bar ${written?.[s.bar - 1] ?? s.bar}`).join(" · "),
	);
</script>

{#if draft.chords.trim()}
	<details class="mt-2 text-12px">
		<summary class="cursor-pointer opacity-70">Chords by bar</summary>
		<pre class="mt-1 whitespace-pre-wrap font-mono opacity-90">{aiChordLines(draft.chords)}</pre>
	</details>
{/if}
{#if sectionsLine}
	<p class="mt-1 text-13px">{sectionsLine}</p>
{/if}
{#if draft.progressions.length > 0}
	<ul class="mt-1 text-13px opacity-90">
		<!-- Unkeyed on purpose: a draft is replaced whole, and section names repeat (two verses). -->
		{#each draft.progressions as pr}
			<li><span class="font-600">{pr.section}:</span> {pr.chords}</li>
		{/each}
	</ul>
{/if}
{#if draft.notes}
	<p class="mt-1 text-12px opacity-70">{draft.notes}</p>
{/if}
