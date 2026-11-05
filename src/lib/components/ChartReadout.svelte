<script lang="ts">
	import InfoTip from "#lib/components/InfoTip.svelte";
	import { chartReadout } from "#lib/utils/chartReadout.js";

	/**
	 * What the chord chart parser reads of a chart, a line under the
	 * document (`chartReadout`): bars, sections and length, or why nothing
	 * reads, then the parser's first warnings and a tip on the grammar; when
	 * no bar reads at all (a chart typed as prose, or one whose only bar line
	 * has an error), a line on how bars are written, with the guide's link,
	 * in the open rather than behind the tip. Nothing for a blank chart or
	 * without `defaults`. A readout only: it never blocks a save.
	 */
	interface Props {
		/** The chart's text as it stands (the editor's while editing). */
		markdown: string;
		/** The song's tempo and meter at 0:00 (`chartDefaults`); without them, no readout. */
		defaults?: { tempo: number | null; meter: string | null };
		/** List the parser's warnings under the summary (off where the page lists them itself, as the read editor does). */
		warnings?: boolean;
	}
	let { markdown, defaults, warnings = true }: Props = $props();

	/** Warnings shown before "and N more". */
	const WARNINGS_SHOWN = 3;
	let readout = $derived(defaults ? chartReadout(markdown, defaults) : null);
</script>

{#if readout}
	<div class="mt-1 text-xs opacity-80">
		<div>
			{readout.summary}
			<InfoTip label="About reading a chart" class="ml-1 align-[-2px]">
				<p>
					Bars between pipes; ## Name starts a section, and a bare ## Name later plays it again; x2
					after the closing pipe repeats the line; / holds, % repeats the bar.
				</p>
				<p class="mt-2">
					<a class="link" href="/docs/writing-a-chord-chart">How to write a chart</a>
				</p>
			</InfoTip>
		</div>
		{#if warnings}
			{#each readout.warnings.slice(0, WARNINGS_SHOWN) as warning, i (i)}
				<p class="text-amber-300">{warning}</p>
			{/each}
			{#if readout.warnings.length > WARNINGS_SHOWN}
				<p class="text-amber-300">and {readout.warnings.length - WARNINGS_SHOWN} more</p>
			{/if}
		{/if}
		{#if readout.hint}
			<p class="mt-1">
				Write each line of bars between pipes, one bar per space, with a heading above each section:
			</p>
			<pre class="mt-1 whitespace-pre-wrap font-mono">## Verse
| D | A | Bm | G |</pre>
			<p class="mt-1">
				<a class="link" href="/docs/writing-a-chord-chart">How to write a chart</a>
			</p>
		{/if}
	</div>
{/if}
