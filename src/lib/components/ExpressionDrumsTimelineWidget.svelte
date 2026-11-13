<script lang="ts">
	import { MAX_DRUM_TIMELINE } from "#lib/constants/expressionDrums.js";
	import { expressionDrums } from "#lib/audio/expressionDrums.svelte.js";
	import type { TimelineBar } from "#lib/val/ExpressionDrumSchema.js";

	const p = $derived(expressionDrums.project);
</script>

<div class="col-span-3 mt-5 @xl-mt-0">
	<div class="device-button-group-label">Timeline</div>
	<div class="flex items-center gap-2 mb-2">
		<button
			class="device-button-xs px-2 {expressionDrums.playsSong ? 'text-accent' : ''}"
			type="button"
			aria-pressed={expressionDrums.playsSong}
			title={expressionDrums.playsSong ? "Deactivate the timeline" : "Activate the timeline"}
			onclick={() => {
				if (p.timeline.length === 0) expressionDrums.appendBar();
				else expressionDrums.setSongMode(!expressionDrums.playsSong);
			}}>Activate</button
		>

				<div class="bg-white/50 flex gap-2 items-center px-2 py-1 rounded-md {expressionDrums.playsSong ? "" : "invisible"}">
					<span class="text-black text-12px whitespace-nowrap">Timeline Mode: </span>
					<div class="flex items-stretch gap-1" role="group" aria-label="Timeline mode">
						<button
							class="device-button-xs px-2 {!expressionDrums.songLoop ? 'text-accent' : ''}"
							type="button"
							aria-pressed={!expressionDrums.songLoop}
							title="Play the timeline once then stop"
							onclick={() => { expressionDrums.songLoop = false; }}>Song</button
						>
						<button
							class="device-button-xs font-thin px-2 text-22px {expressionDrums.songLoop ? 'text-accent' : ''}"
							type="button"
							aria-pressed={expressionDrums.songLoop}
							title="Loop the timeline endlessly"
							onclick={() => { expressionDrums.songLoop = true; }}>∞</button
						>
					</div>
				</div>
	</div>
	<div class="flex flex-wrap items-start gap-2" role="group" aria-label="Bars">
		{#each p.timeline as entry, i (i)}
			{@const bar = entry as TimelineBar}
			{@const sounding = expressionDrums.playsSong && expressionDrums.bar === i}
			{@const next = expressionDrums.queuedBar === i}
			<div
				class="grid grid-cols-2 gap-x-2 rounded-md bg-dark-400/70 px-2 py-1 w-142px text-12px {sounding
					? 'ring-1 ring-green-400'
					: next
						? 'ring-1 ring-accent'
						: ''}"
				role="button"
				tabindex="0"
				aria-label="Tile {i + 1}, pattern {bar.pattern + 1}, {bar.reps} reps{sounding ? ', playing' : ''}{next ? ', next' : ''}"
				title="Click to go to this tile · shift + arrow keys to reorder"
				onclick={() => expressionDrums.goToBar(i)}
				onkeydown={(e) => {
					if (!e.shiftKey || (e.key !== "ArrowLeft" && e.key !== "ArrowRight")) return;
					e.preventDefault();
					expressionDrums.moveBar(i, e.key === "ArrowLeft" ? -1 : 1);
				}}
			>
				<!-- ULH: pattern label + number -->
				<div>
					<div class="text-10px opacity-70 leading-tight">pattern</div>
					<div class="text-16px font-bold {expressionDrums.current === bar.pattern ? 'text-accent' : ''}">{bar.pattern + 1} <span class="text-10px font-normal opacity-70">({p.patterns[bar.pattern]?.meter ?? "4/4"})</span></div>
				</div>
				<!-- URH: reps label + input -->
				<div class="text-right">
					<div class="text-10px opacity-70 leading-tight">reps</div>
					<input
						type="number"
						min="1"
						max="99"
						value={bar.reps}
						class="w-10 bg-dark-600 rounded px-1 py-0 text-right text-14px text-white border-none outline-none"
						onclick={(e) => e.stopPropagation()}
						onchange={(e) => expressionDrums.setBarReps(i, Number(e.currentTarget.value))}
					/>
				</div>
				<!-- Countdown -->
				<div class="col-span-2 text-10px mt-1 {sounding ? 'text-green-400' : 'invisible'}">
					{#if (sounding ? expressionDrums.barRemaining : bar.reps) === 1}
						Change coming next rep
					{:else}
						Change coming in {sounding ? expressionDrums.barRemaining : bar.reps} reps
					{/if}
				</div>
				<!-- Remove button -->
				<button
					class="col-span-2 mt-1 text-10px opacity-40 hover-opacity-100 text-center"
					type="button"
					aria-label="Remove tile {i + 1}"
					title="Remove this tile"
					onclick={(e) => { e.stopPropagation(); expressionDrums.removeBar(i); }}
				>
					<span class="i-ph-x text-8px" aria-hidden="true"></span> remove
				</button>
			</div>
		{/each}
		<button
			class="device-button-xs px-2 self-center"
			type="button"
			disabled={p.timeline.length >= MAX_DRUM_TIMELINE}
			aria-label="Add pattern {expressionDrums.current + 1} as a tile"
			title="The open pattern as the next tile"
			onclick={() => expressionDrums.appendBar()}
		>
			<span class="i-ph-plus" aria-hidden="true"></span>
			{expressionDrums.current + 1}
		</button>
		{#if p.timeline.length}
			<button
				class="device-button-xs px-2 self-center"
				type="button"
				title="Empty the timeline; the patterns stay"
				onclick={() => expressionDrums.clearTimeline()}>Clear</button
			>
		{:else}
			<span class="text-16px @2xl-text-12px opacity-70">Select one of your patterns and add it here.</span>
		{/if}
	</div>

</div>
