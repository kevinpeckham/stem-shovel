<script lang="ts">
	import type { AutomationRange } from "#lib/constants/studioAutomation.js";
	import type { AutomationPoint } from "#lib/utils/automationValueAt.js";
	import { automationValueAt } from "#lib/utils/automationValueAt.js";
	import { editAutomation, type AutomationEdit } from "#lib/utils/editAutomation.js";

	/**
	 * One automation lane (docs/dawn-daw-plan.md, D1), reusable over any
	 * breakpoint list: the curve as a polyline across `width` pixels at
	 * `pxPerSecond`, the points as handles. A click on empty lane adds a
	 * point there; a point drags in time and value (time snapped through
	 * `snap`, Shift free); a double-click removes it; a focused point
	 * nudges with the arrow keys and goes with Delete. Every finished
	 * gesture is one `onchange` with the whole lane, so the caller keeps
	 * one undo step per gesture. `playhead` (seconds) draws the value
	 * there in the readout while the transport runs.
	 */
	interface Props {
		points: AutomationPoint[];
		range: AutomationRange;
		pxPerSecond: number;
		width: number;
		height: number;
		/** Snaps a time to the grid (the engine's `snap`); identity when there is no grid. */
		snap?: (seconds: number) => number;
		playhead?: number | null;
		/** The static value drawn as a flat line when the lane is empty. */
		fallback: number;
		label: string;
		onchange: (points: AutomationPoint[]) => void;
	}
	let {
		points,
		range,
		pxPerSecond,
		width,
		height,
		snap = (s) => s,
		playhead = null,
		fallback,
		label,
		onchange,
	}: Props = $props();

	const PAD = 5;
	const xOf = (t: number) => t * pxPerSecond;
	const yOf = (v: number) =>
		PAD + (1 - (v - range.min) / (range.max - range.min)) * (height - 2 * PAD);
	const tAt = (x: number) => Math.max(0, x / pxPerSecond);
	const vAt = (y: number) =>
		range.min + (1 - (y - PAD) / (height - 2 * PAD)) * (range.max - range.min);

	/** The polyline: the first value held from zero, the last held to the lane's end. */
	const path = $derived.by(() => {
		if (points.length === 0) {
			const y = yOf(fallback);
			return `M0,${y} L${width},${y}`;
		}
		const first = points[0]!;
		const last = points[points.length - 1]!;
		const inner = points.map((p) => `L${xOf(p.t)},${yOf(p.v)}`).join(" ");
		return `M0,${yOf(first.v)} ${inner} L${width},${yOf(last.v)}`;
	});

	let selected = $state<number | null>(null);
	/** A drag in progress: which point, where it started, and the live preview of the lane. */
	let drag = $state<{
		index: number;
		pointerId: number;
		moved: boolean;
		preview: AutomationPoint[];
	} | null>(null);
	const shown = $derived(drag?.preview ?? points);

	function apply(edit: AutomationEdit) {
		const next = editAutomation(points, edit, range);
		selected = next.index;
		onchange(next.points);
	}
	function pointAt(e: PointerEvent, el: Element): { t: number; v: number; free: boolean } {
		const rect = el.getBoundingClientRect();
		const raw = tAt(e.clientX - rect.left);
		return {
			t: e.shiftKey ? raw : snap(raw),
			v: vAt(e.clientY - rect.top),
			free: e.shiftKey,
		};
	}
	function onlanedown(e: PointerEvent) {
		if (e.button !== 0) return;
		if ((e.target as Element).closest("[data-point]")) return;
		const at = pointAt(e, e.currentTarget as Element);
		apply({ kind: "add", t: at.t, v: at.v });
	}
	function onpointdown(e: PointerEvent, index: number) {
		if (e.button !== 0) return;
		e.stopPropagation();
		(e.currentTarget as Element).setPointerCapture(e.pointerId);
		selected = index;
		drag = { index, pointerId: e.pointerId, moved: false, preview: points };
	}
	function onpointmove(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const lane = (e.currentTarget as Element).closest("[data-automation-lane]")!;
		const at = pointAt(e, lane);
		drag.moved = true;
		drag.preview = editAutomation(
			points,
			{ kind: "move", index: drag.index, t: at.t, v: at.v },
			range,
		).points;
	}
	function onpointup(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const d = drag;
		drag = null;
		if (!d.moved) return;
		const lane = (e.currentTarget as Element).closest("[data-automation-lane]")!;
		const at = pointAt(e, lane);
		apply({ kind: "move", index: d.index, t: at.t, v: at.v });
	}
	function onpointkey(e: KeyboardEvent, index: number) {
		const p = points[index];
		if (!p) return;
		const big = e.shiftKey;
		const dv = (range.max - range.min) * (big ? 0.1 : 0.02);
		const dt = big ? 1 : 0.1;
		switch (e.key) {
			case "ArrowUp":
				apply({ kind: "move", index, t: p.t, v: p.v + dv });
				break;
			case "ArrowDown":
				apply({ kind: "move", index, t: p.t, v: p.v - dv });
				break;
			case "ArrowLeft":
				apply({ kind: "move", index, t: p.t - dt, v: p.v });
				break;
			case "ArrowRight":
				apply({ kind: "move", index, t: p.t + dt, v: p.v });
				break;
			case "Delete":
			case "Backspace":
				apply({ kind: "remove", index });
				break;
			default:
				return;
		}
		e.preventDefault();
		e.stopPropagation();
	}
	const readout = $derived(
		playhead === null ? null : range.format(automationValueAt(points, playhead, fallback)),
	);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="relative select-none touch-none"
	style:width="{width}px"
	style:height="{height}px"
	data-automation-lane
	onpointerdown={onlanedown}
>
	<svg class="absolute inset-0 overflow-visible" {width} {height} aria-hidden="true">
		<path d={path} fill="none" class="stroke-accent/80" stroke-width="1.5" />
		{#if shown.length === 0}
			<path
				d={path}
				fill="none"
				class="stroke-accent/80"
				stroke-width="1.5"
				stroke-dasharray="4 4"
			/>
		{/if}
	</svg>
	{#each shown as p, i (i)}
		<button
			type="button"
			class="absolute -translate-x-1/2 -translate-y-1/2 h-3 w-3 rounded-full border-2 outline-none focus-visible:ring-2 focus-visible:ring-playhead {selected ===
			i
				? 'border-white bg-accent'
				: 'border-accent bg-dark hover:bg-accent/60'}"
			style:left="{xOf(p.t)}px"
			style:top="{yOf(p.v)}px"
			aria-label="{label} point {i + 1}: {range.format(p.v)} at {p.t.toFixed(2)} s"
			data-point={i}
			onpointerdown={(e) => onpointdown(e, i)}
			onpointermove={onpointmove}
			onpointerup={onpointup}
			onpointercancel={onpointup}
			ondblclick={(e) => {
				e.stopPropagation();
				apply({ kind: "remove", index: i });
			}}
			onkeydown={(e) => onpointkey(e, i)}
		></button>
	{/each}
	<!-- The label and, while the transport runs, the value at the playhead. -->
	<span
		class="pointer-events-none absolute left-1 top-0.5 rounded bg-dark/70 px-1 text-10px leading-4 text-light/80"
	>
		{readout ? `${label} · ${readout}` : label}
	</span>
</div>
