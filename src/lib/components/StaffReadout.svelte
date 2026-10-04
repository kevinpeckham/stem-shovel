<script lang="ts">
	import type { SpelledNote } from "$lib/utils/noteSpelling";

	/**
	 * The notes sounding, on a small treble staff (docs/piano.md, "The
	 * staff"): five lines with the bottom line E4, a step (a line or a
	 * space) half a line apart, ledger lines where a note sits off the staff,
	 * accidentals before the heads, the same drawing as the chord player's
	 * readout. The view runs from G2 to B6; a note past either end sits at
	 * the edge. `activeMidi` lights the note an arpeggiator is on.
	 */
	interface Props {
		notes: SpelledNote[];
		activeMidi?: number | null;
		class?: string;
	}
	let { notes, activeMidi = null, class: svgClass = "" }: Props = $props();

	/** Half a line per step. */
	const STEP = 2.4;
	const LOW = -12;
	const HIGH = 18;
	const PAD = 5;
	const W = 112;
	const H = (HIGH - LOW) * STEP + PAD * 2;
	const y = (step: number) => PAD + (HIGH - Math.max(LOW, Math.min(HIGH, step))) * STEP;
	const ledgers = (step: number): number[] => {
		const out: number[] = [];
		for (let s = -2; s >= step; s -= 2) out.push(s);
		for (let s = 10; s <= step; s += 2) out.push(s);
		return out;
	};
	const activeIndex = $derived.by(() => {
		if (activeMidi === null) return -1;
		const exact = notes.findIndex((n) => n.midi === activeMidi);
		if (exact >= 0) return exact;
		return notes.findIndex((n) => n.midi % 12 === activeMidi % 12);
	});
	const left = 18;
	const right = W - 6;
	const dx = $derived(Math.min(11, (right - left - 10) / Math.max(1, notes.length)));
	const x0 = $derived(left + 8 + (right - left - 10 - dx * (notes.length - 1)) / 2);
</script>

<svg
	class={svgClass}
	viewBox="0 0 {W} {H}"
	width={W}
	height={H}
	role="img"
	aria-label={notes.length
		? `On the staff: ${notes.map((n) => n.name).join(" ")}`
		: "An empty staff"}
>
	<g class="stroke-current opacity-70" stroke-width="0.6">
		{#each [0, 2, 4, 6, 8] as step (step)}
			<line x1={left} x2={right} y1={y(step)} y2={y(step)} />
		{/each}
		{#each notes as n, i (n.midi)}
			{@const x = x0 + i * dx}
			{#each ledgers(n.step) as s (s)}
				<line x1={x - 4.5} x2={x + 4.5} y1={y(s)} y2={y(s)} />
			{/each}
		{/each}
	</g>
	<text
		class="fill-current opacity-60"
		font-size="7"
		x={left - 14}
		y={y(2) + 2.5}
		font-family="serif"
		font-style="italic">𝄞</text
	>
	{#each notes as n, i (n.midi)}
		{@const x = x0 + i * dx}
		{#if i === activeIndex}
			<circle class="fill-accent/35" cx={x.toFixed(1)} cy={y(n.step).toFixed(1)} r="5" />
		{/if}
		<ellipse
			class={i === activeIndex ? "fill-white" : "fill-accent"}
			cx={x.toFixed(1)}
			cy={y(n.step).toFixed(1)}
			rx="3.2"
			ry="2.2"
			transform="rotate(-20 {x.toFixed(1)} {y(n.step).toFixed(1)})"
		/>
		{#if n.accidental}
			<text
				class="fill-accent"
				font-size="7"
				text-anchor="end"
				dominant-baseline="central"
				x={(x - 4).toFixed(1)}
				y={y(n.step).toFixed(1)}>{n.accidental}</text
			>
		{/if}
	{/each}
</svg>
