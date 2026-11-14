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
		lightsBelow?: boolean;
		onpress: (e: PointerEvent) => void;
		oncyclevelocity: () => void;
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
		lightsBelow = false,
		onpress,
		oncyclevelocity,
	}: Props = $props();

	const HINT = "outline outline-2 outline-accent outline-offset-2";
	let hasSubHits = $derived(!!cell.t1 || !!cell.half || !!cell.t2);
</script>

<div class="relative flex flex-col items-stretch">
	<!-- Desktop: horizontal lights bar above the button -->
	{#if !lightsBelow}
	<div class="
			hidden 
			@4xl-flex 
			justify-center 
			gap-1 
			mb-1
			{!cell.t1 && !cell.half && !cell.t2 ? 'invisible' : ''}">
		{#each Object.keys(cell).slice(1) as cellKey, i}
			<div
				class="w-20px h-20px rounded flex items-center justify-center text-11px font-800 leading-none {cell[cellKey as keyof ExpressionCell]
					? 'bg-[radial-gradient(circle,theme(colors.sky.100),theme(colors.sky.200),theme(colors.sky.400),theme(colors.blue.600))] text-black shadow-[0_0_4px_#d0e2ee]'
					: 'bg-dark-700 text-white/60'}"
			>
				{i % 2 === 0 ? "3" : "2"}
			</div>
		{/each}
	</div>

	{/if}
	<button
		class="device-button-expression-drums !min-w-auto transition-colors duration-75 text-10px font-600 w-full px-4 @4xl-px-1 {cell.main
			? 'text-oxford'
			: 'text-blue-200'} {selected
			? 'outline outline-2 outline-blue-400 outline-offset-1 z-1'
			: ''} {cell.main >= 5
			? 'bg-red-600 text-white hover-!bg-red-500/65'
			: cell.main === 4
			? 'bg-orange-300 hover-!bg-orange-300/65'
			: cell.main === 3
			? 'bg-accent hover-!bg-accent/85'
			: cell.main === 2
				? 'bg-teal-400 border-accent hover-!bg-teal-300/85'
				: cell.main === 1
					? 'bg-sky-300 border-accent/50 hover-!bg-sky-300/50'
					: hasSubHits
						? 'bg-slate-9 00 border-white/15'
						: offBeat
							? 'bg-dark/60 border-white/10'
							: 'bg-dark/30 border-white/10'} {now
			? 'ring-2 ring-blue-100 ring-inset'
			: ''} {hinted ? HINT : ''}"
		type="button"
		aria-pressed={cellActive(cell)}
		aria-label="{voiceLabel}, step {step + 1}{cell.main === 3
			? ', accent'
			: cell.main === 1
				? ', ghost'
				: ''}"
		title={cellActive(cell) ? "Hold, shift-click or right-click for the velocity" : undefined}
		data-row={row}
		data-step={step}
		onpointerdown={onpress}
		oncontextmenu={(e) => {
			e.preventDefault();
			oncyclevelocity();
		}}
	>
		<div class="flex flex-col items-center">
			<div class="text-20px md:text-13px">{selIndex !== null ? selIndex : ""}</div>
			<div class="h-13px">{cell.main ? `V${cell.main}` : hasSubHits ? "after" : ""}</div>
		</div>

		<!-- Narrow: vertical bar inside button on the right -->
		<div class="
				flex 
				flex-col 
				gap-1px 
				ml-auto 
				@4xl-hidden
				{!cell.t1 && !cell.half && !cell.t2 ? 'invisible' : ''}
				">
			{#each Object.keys(cell).slice(1) as cellKey, i}
				<div
					class="w-16px h-16px rounded flex items-center justify-center text-10px font-800 leading-none mb-0.2 {cell[cellKey as keyof ExpressionCell]
						? 'bg-[radial-gradient(circle,theme(colors.sky.100),theme(colors.sky.200),theme(colors.sky.400),theme(colors.blue.600))] text-black shadow-[0_0_4px_#d0e2ee]'
						: 'bg-dark-700 text-white/60'}"
				>
					{i % 2 === 0 ? "3" : "2"}
				</div>
			{/each}
		</div>
	</button>

	<!-- Desktop: horizontal lights bar below the button (last voice row) -->
	{#if lightsBelow}
			<div class="
					hidden 
					@4xl-flex 
					justify-center 
					gap-1 
					mt-1
					{!cell.t1 && !cell.half && !cell.t2 ? 'invisible' : ''}">
			{#each Object.keys(cell).slice(1) as cellKey, i}
				<div
					class="w-20px h-20px rounded flex items-center justify-center text-11px font-800 leading-none {cell[cellKey as keyof ExpressionCell]
						? 'bg-[radial-gradient(circle,theme(colors.sky.100),theme(colors.sky.200),theme(colors.sky.400),theme(colors.blue.600))] text-black shadow-[0_0_4px_#d0e2ee]'
						: 'bg-dark-700 text-white/60'}"
				>
					{i % 2 === 0 ? "3" : "2"}
				</div>
			{/each}
		</div>
	{/if}
</div>
