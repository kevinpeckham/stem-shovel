<script lang="ts">
	import InfoTip from "#lib/components/InfoTip.svelte";
	import { chartReadout } from "#lib/utils/chartReadout.js";

	/**
	 * What the chord chart parser reads of a chart, a line under the
	 * document (`chartReadout`): bars, sections and length, or why nothing
	 * reads, then the parser's first warnings and a tip on the grammar.
	 * Nothing for a blank chart or without `defaults`. A readout only: it never blocks a save.
	 */
	interface Props {
		/** The chart's text as it stands (the editor's while editing). */
		markdown: string;
		/** The song's tempo and meter at 0:00 (`chartDefaults`); without them, no readout. */
		defaults?: { tempo: number | null; meter: string | null };
	}
	let { markdown, defaults }: Props = $props();

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
					Bars in pipes or between dots; x2 after a chord repeats its bar, after the pipe the line;
					a Structure line sets the play order.
				</p>
				<p class="mt-2">
					<a class="link" href="/docs/writing-a-chord-chart">How to write a chart</a>
				</p>
			</InfoTip>
		</div>
		{#each readout.warnings.slice(0, WARNINGS_SHOWN) as warning, i (i)}
			<p class="text-amber-300">{warning}</p>
		{/each}
		{#if readout.warnings.length > WARNINGS_SHOWN}
			<p class="text-amber-300">and {readout.warnings.length - WARNINGS_SHOWN} more</p>
		{/if}
	</div>
{/if}
