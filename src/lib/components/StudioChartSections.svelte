<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import type { BarGrid } from "#lib/audio/measures.js";
	import { chartSections } from "#lib/utils/chartSections.js";
	import { formatTime } from "#lib/utils/formatTime.js";

	/**
	 * "Sections from a chart" in the Studio's transport: a barmark chord
	 * chart, pasted or picked, whose sections become section markers from
	 * the playhead (docs/barmark-integration-audit.md, item 7).
	 */
	interface Props {
		grid: BarGrid;
		from: number;
		onadd: (sections: { name: string; start: number }[]) => { added: number; renamed: number };
		/** The song's own chart (docs/barmark-integration-audit.md item 9), offered until something is typed or picked. */
		text?: string;
	}
	let { grid, from, onadd, text: songChart = "" }: Props = $props();

	const PLACEHOLDER =
		"key: G\ntime: 4/4\ntempo: 120\n\n## Verse\n| G | D | Em | C |\n\n## Chorus\n| C | G | D | D |";

	/** What was typed or picked; null until then, so the song's chart shows. */
	let typed = $state<string | null>(null);
	const text = $derived(typed ?? songChart);
	let status = $state<string | null>(null);
	const preview = $derived(text.trim() ? chartSections(text, { grid, from }) : null);
	const canAdd = $derived(!!preview && preview.sections.length > 0 && !preview.errors.length);

	function setText(next: string) {
		typed = next;
		status = null;
	}
	async function pick(e: Event & { currentTarget: HTMLInputElement }) {
		const file = e.currentTarget.files?.[0];
		if (file) setText(await file.text());
		e.currentTarget.value = "";
	}
	const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
	function add() {
		if (!preview || !canAdd) return;
		const r = onadd(preview.sections.map(({ name, start }) => ({ name, start })));
		const parts = [`${plural(r.added, "section")} added`];
		if (r.renamed) parts.push(`${r.renamed} renamed`);
		status = parts.join(", ");
	}
</script>

{#snippet block()}
	<div class="px-3 pt-2 pb-4 grid gap-3">
		<textarea
			class="device-field w-full min-h-24 resize-y text-13px font-mono"
			aria-label="Chart"
			placeholder={PLACEHOLDER}
			value={text}
			oninput={(e) => setText(e.currentTarget.value)}></textarea>
		<input
			class="text-12px"
			type="file"
			accept=".md,.txt,text/markdown,text/plain"
			aria-label="Chart file"
			onchange={pick}
		/>
		{#if preview}
			{@render summary(preview)}
		{/if}
		<p class="text-12px opacity-70">
			Each ## heading becomes a section marker from the playhead, timed by the chart's tempo, or on
			the Studio's bars when the chart names none. Undo removes them all.
		</p>
		<div class="flex items-center gap-3">
			<button class="device-button-xs px-3" type="button" disabled={!canAdd} onclick={add}>
				Add sections
			</button>
			<span class="text-12px" role="status">{status ?? ""}</span>
		</div>
	</div>
{/snippet}

{#snippet summary(p: NonNullable<typeof preview>)}
	{#if p.sections.length}
		<ol class="grid gap-1 text-13px" aria-label="Sections found">
			{#each p.sections as s, i (i)}
				<li class="flex gap-3">
					<span class="font-mono tabular-nums opacity-70">{formatTime(s.start, 0)}</span>
					<span>{s.name}</span>
				</li>
			{/each}
		</ol>
		<p class="text-12px">
			{plural(p.bars, "bar")} · {formatTime(p.seconds - from, 0)}
		</p>
	{/if}
	{#if p.errors.length}
		<ul class="text-12px text-red-300 grid gap-1" role="alert">
			{#each p.errors as message, i (i)}
				<li>{message}</li>
			{/each}
		</ul>
	{:else if p.warnings.length}
		<ul class="text-12px opacity-70 grid gap-1">
			{#each p.warnings as message, i (i)}
				<li>{message}</li>
			{/each}
		</ul>
	{/if}
{/snippet}

<ContextMenu
	ariaLabel="Sections from a chart"
	title="Section markers from a barmark chord chart: paste it or pick the file, and its sections land from the playhead"
	iconClass="i-ph-bookmarks"
	position="bottom left"
	buttonBaseClasses="device-button-sm px-3 min-w-32px"
	popoverClasses="min-w-80 max-w-md !max-h-[calc(100%-0.5rem)] overflow-y-auto"
	items={[
		{ id: "chart-sections-heading", kind: "heading", label: "Sections from a chart" },
		{ id: "chart-sections", kind: "snippet", snippet: block },
	]}
/>
