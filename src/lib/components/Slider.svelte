<script lang="ts">
	import { snapToStep } from "#lib/utils/snapToStep.js";

	/**
	 * A device slider in place of an `<input type="range">`, the knob's
	 * sibling (Knob.svelte): a track with the value's share filled (from
	 * the left end, or from the centre for a bipolar control), a round
	 * thumb, and the value's text never, always, or in a small popover
	 * over the thumb while it moves. A press anywhere on the track jumps
	 * there and drags from there (Shift makes the drag four times finer),
	 * the wheel steps it, and the keys: arrows by a step (Shift by ten),
	 * Home and End to the ends, Page Up and Down by ten steps. A
	 * double-click returns to `resetTo` when given. Horizontal, or
	 * vertical with the top the maximum. A slider to assistive technology,
	 * with the formatted value as its text.
	 */
	interface Props {
		value: number;
		min?: number;
		max?: number;
		step?: number;
		/** The value a double-click returns to (unity on a fader, say). */
		resetTo?: number;
		/** The track fills from the centre rather than the left end. */
		bipolar?: boolean;
		orientation?: "horizontal" | "vertical";
		/** The track's thickness in pixels; the thumb is twice it. */
		thickness?: number;
		/** What the control is, for assistive technology. */
		label: string;
		title?: string;
		/** The value as text, for the popover and the slider's value text. */
		format?: (value: number) => string;
		/** When the value's text shows. */
		showValue?: "never" | "always" | "adjusting";
		disabled?: boolean;
		/** Every change as it happens (a drag's every pixel). */
		oninput?: (value: number) => void;
		/** The value once a gesture ends. */
		onchange?: (value: number) => void;
		class?: string;
	}
	let {
		value,
		min = 0,
		max = 1,
		step = 0.01,
		resetTo,
		bipolar = false,
		orientation = "horizontal",
		thickness = 6,
		label,
		title,
		format = (v) => String(Math.round(v * 100) / 100),
		showValue = "adjusting",
		disabled = false,
		oninput,
		onchange,
		class: extra = "",
	}: Props = $props();

	let vertical = $derived(orientation === "vertical");
	let range = $derived(Math.max(1e-9, max - min));
	let fraction = $derived(Math.max(0, Math.min(1, (value - min) / range)));
	let zero = $derived(bipolar ? Math.max(0, Math.min(1, (0 - min) / range)) : 0);
	let fillFrom = $derived(Math.min(zero, fraction));
	let fillTo = $derived(Math.max(zero, fraction));
	let thumb = $derived(thickness * 2);

	let adjusting = $state(false);
	let settle: ReturnType<typeof setTimeout> | null = null;
	function touched(sticky = false) {
		adjusting = true;
		if (settle) clearTimeout(settle);
		if (!sticky) settle = setTimeout(() => (adjusting = false), 700);
	}
	function set(v: number, final: boolean) {
		const next = snapToStep(v, min, max, step);
		if (next !== value) {
			value = next;
			oninput?.(next);
		}
		if (final) onchange?.(next);
	}
	/** The value under a pointer: its place along the track as a share of the range. */
	function valueAt(el: HTMLElement, clientX: number, clientY: number) {
		const r = el.getBoundingClientRect();
		const f = vertical
			? 1 - (clientY - r.top) / Math.max(1, r.height)
			: (clientX - r.left) / Math.max(1, r.width);
		return min + Math.max(0, Math.min(1, f)) * range;
	}
	let drag: { pointerId: number; x: number; y: number; from: number; el: HTMLElement } | null =
		null;
	function onpointerdown(e: PointerEvent) {
		if (disabled || e.button !== 0) return;
		const el = e.currentTarget as HTMLElement;
		set(valueAt(el, e.clientX, e.clientY), false);
		drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, from: value, el };
		el.setPointerCapture(e.pointerId);
		el.focus();
		touched(true);
		e.preventDefault();
	}
	function onpointermove(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		if (e.shiftKey) {
			// Fine: a quarter of the pointer's travel, from where the press landed.
			const r = drag.el.getBoundingClientRect();
			const length = Math.max(1, vertical ? r.height : r.width);
			const moved = vertical ? drag.y - e.clientY : e.clientX - drag.x;
			set(drag.from + (moved / length / 4) * range, false);
		} else set(valueAt(drag.el, e.clientX, e.clientY), false);
	}
	function onpointerup(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		drag = null;
		set(value, true);
		touched();
	}
	function onwheel(e: WheelEvent) {
		if (disabled) return;
		e.preventDefault();
		const direction = e.deltaY < 0 ? 1 : e.deltaY > 0 ? -1 : 0;
		if (!direction) return;
		set(value + direction * step * (e.shiftKey ? 10 : 1), true);
		touched();
	}
	function onkeydown(e: KeyboardEvent) {
		if (disabled) return;
		const by = step * (e.shiftKey ? 10 : 1);
		const moves: Record<string, number> = {
			ArrowUp: value + by,
			ArrowRight: value + by,
			ArrowDown: value - by,
			ArrowLeft: value - by,
			PageUp: value + step * 10,
			PageDown: value - step * 10,
			Home: min,
			End: max,
		};
		const next = moves[e.key];
		if (next === undefined) return;
		e.preventDefault();
		set(next, true);
		touched();
	}
	function ondblclick() {
		if (disabled || resetTo === undefined) return;
		set(resetTo, true);
		touched();
	}
	let text = $derived(format(value));
	let valueShown = $derived(showValue === "always" || (showValue === "adjusting" && adjusting));
	/** The thumb's place along the track, as a percentage from the start (the bottom when vertical). */
	let along = $derived(`${Math.round(fraction * 1000) / 10}%`);
</script>

<span
	class="relative inline-flex {vertical ? 'h-full flex-col' : 'w-full'} items-center {extra}"
	data-slider
>
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="relative shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-playhead touch-none select-none {vertical
			? 'h-full'
			: 'w-full'} {disabled ? 'opacity-40 cursor-default' : 'cursor-pointer'}"
		style:min-width={vertical ? `${thumb}px` : undefined}
		style:min-height={vertical ? undefined : `${thumb}px`}
		style:width={vertical ? `${thumb}px` : undefined}
		style:height={vertical ? undefined : `${thumb}px`}
		role="slider"
		tabindex={disabled ? -1 : 0}
		aria-label={label}
		aria-valuemin={min}
		aria-valuemax={max}
		aria-valuenow={value}
		aria-valuetext={text}
		aria-orientation={orientation}
		aria-disabled={disabled || undefined}
		{title}
		{onpointerdown}
		{onpointermove}
		{onpointerup}
		onpointercancel={onpointerup}
		{onwheel}
		{onkeydown}
		{ondblclick}
	>
		<!-- the track, its fill, and the thumb -->
		<div
			class="absolute rounded-full bg-white/15 {vertical
				? 'left-1/2 top-0 bottom-0 -translate-x-1/2'
				: 'top-1/2 left-0 right-0 -translate-y-1/2'}"
			style:width={vertical ? `${thickness}px` : undefined}
			style:height={vertical ? undefined : `${thickness}px`}
		>
			<div
				class="absolute rounded-full bg-blue-300 {vertical ? 'left-0 right-0' : 'top-0 bottom-0'}"
				style:left={vertical ? undefined : `${fillFrom * 100}%`}
				style:right={vertical ? undefined : `${(1 - fillTo) * 100}%`}
				style:bottom={vertical ? `${fillFrom * 100}%` : undefined}
				style:top={vertical ? `${(1 - fillTo) * 100}%` : undefined}
			></div>
		</div>
		<div
			class="absolute rounded-full border border-white/30 bg-blue-100 shadow {vertical
				? 'left-1/2 -translate-x-1/2 translate-y-1/2'
				: 'top-1/2 -translate-y-1/2 -translate-x-1/2'}"
			style:width="{thumb}px"
			style:height="{thumb}px"
			style:left={vertical ? undefined : along}
			style:bottom={vertical ? along : undefined}
			data-slider-thumb
		></div>
	</div>
	{#if valueShown}
		<span
			class="pointer-events-none whitespace-nowrap rounded border border-white/15 bg-oxford-900 px-1 text-10px leading-4 tabular-nums text-blue-100 {showValue ===
			'adjusting'
				? `absolute z-20 shadow ${vertical ? 'left-full ml-1' : '-top-5 -translate-x-1/2'}`
				: 'mt-0.5'}"
			style:left={showValue === "adjusting" && !vertical ? along : undefined}
			style:bottom={showValue === "adjusting" && vertical ? along : undefined}
			data-slider-value
		>
			{text}
		</span>
	{/if}
</span>
