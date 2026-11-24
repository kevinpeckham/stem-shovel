<script lang="ts">
	import { cellActive, type ExpressionCell } from "#lib/val/ExpressionDrumSchema.js";

	interface Props {
		cell: ExpressionCell;
		row: number;
		step: number;
		voiceLabel: string;
		offBeat: boolean;
		now: boolean;
		selected: boolean;
		selIndex: number | null;
		hinted: boolean;
		onpointerdown: (e: PointerEvent) => void;
		onclick: (e: MouseEvent) => void;
		onrightclick: (e: MouseEvent) => void;
	}
	let {
		cell,
		row,
		step,
		voiceLabel,
		offBeat,
		now,
		selected,
		selIndex,
		hinted,
		onpointerdown,
		onclick,
		onrightclick,
	}: Props = $props();

	const HINT = "outline outline-2 outline-accent outline-offset-2";

	/** Yellow at increasing brightness: V1 = 20%, V2 = 40%, V3 = 60%, V4 = 80%, V5 = 100% (white). */
	const VELOCITY_BG: Record<number, string> = {
		1: "bg-[hsl(66,95%,25%)] hover-!bg-[hsl(66,95%,30%)]",
		2: "bg-[hsl(66,95%,40%)] hover-!bg-[hsl(66,95%,45%)]",
		3: "bg-[hsl(66,95%,48%)] hover-!bg-[hsl(66,95%,53%)]",
		4: "bg-[hsl(66,95%,80%)] hover-!bg-[hsl(66,95%,85%)]",
		5: "bg-[hsl(66,95%,100%)] hover-!bg-[hsl(66,95%,95%)]",
	};

	/** Blue at increasing brightness, matching the pan fader's hue. */
	const SUBHIT_BG: Record<number, string> = {
		1: "bg-[hsl(213,97%,50%)] border-transparent",
		2: "bg-[hsl(213,97%,62%)] border-transparent",
		3: "bg-[hsl(213,97%,68%)] border-transparent",
		4: "bg-[hsl(213,97%,74%)] border-transparent",
		5: "bg-[hsl(213,97%,80%)] border-transparent",
	};

	let hasSubHits = $derived(!!cell.t1 || !!cell.half || !!cell.t2);
</script>

<button
	class="device-button-expression-drums !min-w-auto transition-colors duration-75 text-10px font-600 w-full px-2 py-2 flex-col {cell.main
		? 'text-oxford'
		: 'text-blue-200'} {selected
		? 'outline outline-2 outline-blue-400 outline-offset-1 z-1'
		: ''} {VELOCITY_BG[cell.main]
		?? (hasSubHits
			? 'bg-slate-900 border-white/15'
			: offBeat
				? 'bg-dark/60 border-white/10'
				: 'bg-dark/30 border-white/10')} {now
		? 'ring-2 ring-blue-100 ring-inset'
		: ''} {hinted ? HINT : ''}"
	type="button"
	aria-pressed={cellActive(cell)}
	aria-label="{voiceLabel}, step {step + 1}{cell.main === 3
		? ', accent'
		: cell.main === 1
			? ', ghost'
			: ''}"
	title={cellActive(cell) ? "Right-click or Ctrl/⌘+click for advanced options" : undefined}
	data-row={row}
	data-step={step}
	onpointerdown={onpointerdown}
	onclick={onclick}
	oncontextmenu={(e) => {
		e.preventDefault();
		onrightclick(e);
	}}
>
	<!-- Sub-hit circles -->
	<div class="flex justify-evenly flex-nowrap max-w-15 overflow-hidden w-full {!cell.t1 && !cell.half && !cell.t2 ? 'invisible' : ''}">
		{#each ["t1", "half", "t2"] as key}
			<div
				class="w-6px h-8px shrink-0 rounded-full border @5xl-h-10px @5xl-w-8px {SUBHIT_BG[cell[key as keyof ExpressionCell]]
					?? 'bg-black border-white/45'}"
			></div>
		{/each}
	</div>

	<div class="flex flex-col items-center">
		<div class="text-20px md:text-13px">{selIndex !== null ? selIndex : ""}</div>
		<div class="h-13px">{hasSubHits && !cell.main ? "after" : ""}</div>
	</div>
</button>
