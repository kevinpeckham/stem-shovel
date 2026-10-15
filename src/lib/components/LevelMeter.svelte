<script lang="ts">
	import { METER_ZERO, meterWidth, type MeterState } from "#lib/utils/meterLevel.js";

	/**
	 * A level meter with a peak-hold mark and a clip light that sticks until
	 * it is clicked (docs/stem-engine.md, "Meters"): the bar on a dB scale
	 * (−48 dB to unity), amber from −6 dB, red at the top; the mark a thin
	 * tick; the light a small square at the end, red while a clip is held.
	 */
	interface Props {
		state?: MeterState | undefined;
		label: string;
		onreset?: () => void;
		class?: string;
	}
	let { state = METER_ZERO, label, onreset, class: cls = "" }: Props = $props();
	const width = $derived(meterWidth(state.level));
	const hold = $derived(meterWidth(state.hold));
	const hot = $derived(state.level >= 10 ** (-6 / 20));
</script>

<div class="flex items-center gap-1 {cls}">
	<div
		class="relative h-1.5 min-w-0 flex-1 overflow-hidden rounded bg-blue-100/10"
		role="meter"
		aria-label="{label} level"
		aria-valuemin={0}
		aria-valuemax={100}
		aria-valuenow={Math.round(width * 100)}
	>
		<div
			class="h-full rounded {state.level >= 0.999
				? 'bg-red-500'
				: hot
					? 'bg-amber-300'
					: 'bg-blue-300'}"
			style:width="{width * 100}%"
		></div>
		{#if hold > 0}
			<div
				class="absolute top-0 h-full w-px {state.hold >= 0.999 ? 'bg-red-400' : 'bg-blue-100'}"
				style:left="calc({hold * 100}% - 1px)"
				aria-hidden="true"
			></div>
		{/if}
	</div>
	<button
		type="button"
		class="h-2.5 w-2.5 shrink-0 rounded-sm border border-white/25 transition-colors {state.clipped
			? 'bg-red-500 border-red-400'
			: 'bg-white/5 hover:border-white/60'}"
		aria-label="{label} clip{state.clipped ? ': clipped, click to reset' : ''}"
		aria-pressed={state.clipped}
		title={state.clipped
			? "Clipped: click to reset"
			: "Clip light (lights when the level reaches full scale; click to reset)"}
		onclick={onreset}
	></button>
</div>
