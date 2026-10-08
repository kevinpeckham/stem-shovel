<script lang="ts">
	/**
	 * A device knob in place of an `<input type="range">`: a 270° arc with
	 * the value's share filled (from the left end, or from the centre for a
	 * bipolar control like pan), a pointer on the cap, and the value's text
	 * never, always, or in a small popover while it is being adjusted.
	 * Drag up or right to raise it (200 px of travel is the whole range;
	 * Shift makes it four times finer), roll the wheel, or use the keys:
	 * arrows by a step (Shift by ten), Home and End to the ends, Page Up and
	 * Down by ten steps. A double-click returns to `resetTo` when given. A
	 * slider to assistive technology, with the formatted value as its text.
	 */
	interface Props {
		value: number;
		min?: number;
		max?: number;
		step?: number;
		/** The value a double-click returns to (the centre of a pan, say). */
		resetTo?: number;
		/** The arc fills from the centre rather than the left end. */
		bipolar?: boolean;
		/** The knob's diameter in pixels. */
		size?: number;
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
		size = 26,
		label,
		title,
		format = (v) => String(Math.round(v * 100) / 100),
		showValue = "adjusting",
		disabled = false,
		oninput,
		onchange,
		class: extra = "",
	}: Props = $props();

	const SWEEP = 270;
	const START = -135;
	/** Pixels of pointer travel across the whole range. */
	const TRAVEL = 200;
	const R = 16;
	const C = 20;

	let range = $derived(Math.max(1e-9, max - min));
	let fraction = $derived(Math.max(0, Math.min(1, (value - min) / range)));
	let angle = $derived(START + fraction * SWEEP);
	/** Where the filled arc begins: the left end, or the centre for a bipolar control. */
	let fillFrom = $derived(bipolar ? START + ((0 - min) / range) * SWEEP : START);

	function point(deg: number, r = R) {
		const rad = (deg * Math.PI) / 180;
		return { x: C + r * Math.sin(rad), y: C - r * Math.cos(rad) };
	}
	/** An arc of the ring from one angle to another (degrees from the top, clockwise). */
	function arc(from: number, to: number) {
		const a = Math.min(from, to);
		const b = Math.max(from, to);
		if (b - a < 0.01) return "";
		const p = point(a);
		const q = point(b);
		return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)} A ${R} ${R} 0 ${b - a > 180 ? 1 : 0} 1 ${q.x.toFixed(2)} ${q.y.toFixed(2)}`;
	}
	let track = $derived(arc(START, START + SWEEP));
	let fill = $derived(arc(fillFrom, angle));
	let pointerStart = $derived(point(angle, 6));
	let pointerEnd = $derived(point(angle, 12));

	/** A value on the step grid, within the range, as the input is given. */
	function snap(v: number) {
		const clamped = Math.max(min, Math.min(max, v));
		const decimals = Math.max(0, Math.min(6, Math.ceil(-Math.log10(step)) + 1));
		return Number((Math.round((clamped - min) / step) * step + min).toFixed(decimals));
	}
	let adjusting = $state(false);
	let settle: ReturnType<typeof setTimeout> | null = null;
	/** The popover shows while a gesture runs, and for a moment after a key or the wheel. */
	function touched(sticky = false) {
		adjusting = true;
		if (settle) clearTimeout(settle);
		if (!sticky) settle = setTimeout(() => (adjusting = false), 700);
	}
	function set(v: number, final: boolean) {
		const next = snap(v);
		if (next !== value) {
			value = next;
			oninput?.(next);
		}
		if (final) onchange?.(next);
	}

	let drag: { pointerId: number; x: number; y: number; from: number } | null = null;
	function onpointerdown(e: PointerEvent) {
		if (disabled || e.button !== 0) return;
		drag = { pointerId: e.pointerId, x: e.clientX, y: e.clientY, from: value };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		(e.currentTarget as HTMLElement).focus();
		touched(true);
		e.preventDefault();
	}
	function onpointermove(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const travel = e.shiftKey ? TRAVEL * 4 : TRAVEL;
		const delta = (drag.y - e.clientY + (e.clientX - drag.x)) / travel;
		set(drag.from + delta * range, false);
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
</script>

<span class="relative inline-flex flex-col items-center {extra}">
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<div
		class="shrink-0 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-playhead touch-none select-none {disabled
			? 'opacity-40 cursor-default'
			: 'cursor-ns-resize'}"
		style:width="{size}px"
		style:height="{size}px"
		role="slider"
		tabindex={disabled ? -1 : 0}
		aria-label={label}
		aria-valuemin={min}
		aria-valuemax={max}
		aria-valuenow={value}
		aria-valuetext={text}
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
		<svg viewBox="0 0 40 40" width={size} height={size} aria-hidden="true" class="block">
			<circle cx={C} cy={C} r="11" class="fill-oxford-800 stroke-white/15" stroke-width="1" />
			<path d={track} fill="none" class="stroke-white/15" stroke-width="3" stroke-linecap="round" />
			{#if fill}
				<path d={fill} fill="none" class="stroke-accent" stroke-width="3" stroke-linecap="round" />
			{/if}
			<line
				x1={pointerStart.x}
				y1={pointerStart.y}
				x2={pointerEnd.x}
				y2={pointerEnd.y}
				class="stroke-blue-100"
				stroke-width="2.5"
				stroke-linecap="round"
			/>
		</svg>
	</div>
	{#if valueShown}
		<span
			class="pointer-events-none whitespace-nowrap rounded border border-white/15 bg-oxford-900 px-1 text-10px leading-4 tabular-nums text-blue-100 {showValue ===
			'adjusting'
				? 'absolute -top-5 left-1/2 -translate-x-1/2 z-20 shadow'
				: 'mt-0.5'}"
			data-knob-value
		>
			{text}
		</span>
	{/if}
</span>
