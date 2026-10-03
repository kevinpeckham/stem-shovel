<script lang="ts">
	import type { ChordQuality, CirclePosition } from "$lib/constants/circleOfFifths";
	import { CIRCLE_SIZE, wedgeCenter, wedgePath } from "$lib/utils/circleGeometry";
	import { CHORD_KEY_LABELS } from "$lib/constants/circleOfFifths";
	/** The key labels sit under the chord names: the same angle, a few units lower. */
	const KEY_DY_MAJOR = 15;
	const KEY_DY_MINOR = 12;

	/**
	 * The circle of fifths as an SVG instrument (docs/chord-player.md): two
	 * rings of twelve wedges, majors outside and their relative minors
	 * inside, the key signatures around them, the first position at twelve
	 * o'clock. In notes mode the rings become one ring of twelve notes. A
	 * pointer down on a wedge presses it (`onpress`), up or cancel releases
	 * it (`onrelease`); pointer capture keeps a finger that slides off the
	 * wedge on the same chord until it lifts. Several pointers at once.
	 */
	interface Props {
		positions: CirclePosition[];
		notes: { pitch: number; label: string }[];
		mode: "chords" | "notes";
		showSignatures: boolean;
		/** The computer keyboard's keys on the wedges. */
		showKeys?: boolean;
		/** The ids of the wedges that are sounding (lit). */
		pressed: Set<string>;
		/** The text in the centre (the chords sounding). */
		centre: string;
		onpress: (index: number, quality: ChordQuality, pointerId: number) => void;
		onrelease: (pointerId: number) => void;
		/** The SVG's own classes (its size; a phone draws it wider than its box so the sides crop flat). */
		class?: string;
	}
	let {
		positions,
		notes,
		mode,
		showSignatures,
		showKeys = false,
		pressed,
		centre,
		onpress,
		onrelease,
		class: svgClass = "w-full",
	}: Props = $props();

	const R_OUTER = 190;
	const R_MAJOR_IN = 130;
	const R_MINOR_IN = 72;
	const SIGNATURE_R = 182;

	/** The wedge under a pointer: its index and quality, from the element's data. */
	function wedgeAt(e: PointerEvent): { index: number; quality: ChordQuality } | null {
		const el = (e.target as Element | null)?.closest<SVGPathElement>("[data-index]");
		if (!el) return null;
		return {
			index: Number(el.dataset.index),
			quality: (el.dataset.quality as ChordQuality) ?? "major",
		};
	}
	function down(e: PointerEvent) {
		const w = wedgeAt(e);
		if (!w) return;
		e.preventDefault();
		(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
		onpress(w.index, w.quality, e.pointerId);
	}
	function up(e: PointerEvent) {
		onrelease(e.pointerId);
	}
	const idOf = (p: CirclePosition, quality: ChordQuality) => p[quality].id;
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
	class="{svgClass} h-auto aspect-square select-none touch-none"
	viewBox="0 0 {CIRCLE_SIZE} {CIRCLE_SIZE}"
	role="application"
	aria-label="Circle of fifths"
	onpointerdown={down}
	onpointerup={up}
	onpointercancel={up}
	oncontextmenu={(e) => e.preventDefault()}
>
	{#if mode === "notes"}
		{#each notes as note, i (i)}
			{@const d = wedgePath(R_MINOR_IN, R_OUTER, i)}
			{@const [x, y] = wedgeCenter((R_MINOR_IN + R_OUTER) / 2, i)}
			<path
				class="stroke-oxford-900 stroke-1 cursor-pointer transition-colors {pressed.has(`note:${i}`)
					? 'fill-accent'
					: 'fill-slate-800 hover-fill-slate-700'}"
				{d}
				data-index={i}
				data-quality="major"
				role="button"
				aria-label="{note.label} note"
				aria-pressed={pressed.has(`note:${i}`)}
			/>
			<text
				class="pointer-events-none fill-current text-22px"
				text-anchor="middle"
				dominant-baseline="central"
				x={x.toFixed(1)}
				y={y.toFixed(1)}>{note.label}</text
			>
			{#if showKeys}
				<text
					class="pointer-events-none fill-accent opacity-80 text-10px"
					text-anchor="middle"
					dominant-baseline="central"
					x={x.toFixed(1)}
					y={(y + KEY_DY_MAJOR).toFixed(1)}>{CHORD_KEY_LABELS[i].major}</text
				>
			{/if}
		{/each}
	{:else}
		{#each positions as p, i (p.index)}
			{@const lit = pressed.has(idOf(p, "major"))}
			{@const litMinor = pressed.has(idOf(p, "minor"))}
			<path
				class="stroke-oxford-900 stroke-1 cursor-pointer transition-colors {lit
					? 'fill-accent'
					: 'fill-slate-800 hover-fill-slate-700'}"
				d={wedgePath(R_MAJOR_IN, R_OUTER, i)}
				data-index={i}
				data-quality="major"
				role="button"
				aria-label="{p.major.label} major"
				aria-pressed={lit}
			/>
			<path
				class="stroke-oxford-900 stroke-1 cursor-pointer transition-colors {litMinor
					? 'fill-accent'
					: 'fill-slate-700 hover-fill-slate-600'}"
				d={wedgePath(R_MINOR_IN, R_MAJOR_IN, i)}
				data-index={i}
				data-quality="minor"
				role="button"
				aria-label="{p.minor.label} minor"
				aria-pressed={litMinor}
			/>
		{/each}
		{#each positions as p, i (p.index)}
			{@const [x1, y1] = wedgeCenter(162, i)}
			{@const [x2, y2] = wedgeCenter(101, i)}
			<text
				class="pointer-events-none text-22px {pressed.has(idOf(p, 'major'))
					? 'fill-oxford'
					: 'fill-current'}"
				text-anchor="middle"
				dominant-baseline="central"
				x={x1.toFixed(1)}
				y={y1.toFixed(1)}>{p.major.label}</text
			>
			<text
				class="pointer-events-none text-16px {pressed.has(idOf(p, 'minor'))
					? 'fill-oxford'
					: 'fill-current opacity-90'}"
				text-anchor="middle"
				dominant-baseline="central"
				x={x2.toFixed(1)}
				y={y2.toFixed(1)}>{p.minor.label}</text
			>
			{#if showKeys}
				<text
					class="pointer-events-none fill-accent opacity-80 text-10px"
					text-anchor="middle"
					dominant-baseline="central"
					x={x1.toFixed(1)}
					y={(y1 + KEY_DY_MAJOR).toFixed(1)}>{CHORD_KEY_LABELS[i].major}</text
				>
				<text
					class="pointer-events-none fill-accent opacity-80 text-9px"
					text-anchor="middle"
					dominant-baseline="central"
					x={x2.toFixed(1)}
					y={(y2 + KEY_DY_MINOR).toFixed(1)}>{CHORD_KEY_LABELS[i].minor}</text
				>
			{/if}
			{#if showSignatures && p.signature}
				{@const [xs, ys] = wedgeCenter(SIGNATURE_R, i)}
				<text
					class="pointer-events-none fill-current opacity-60 text-9px"
					text-anchor="middle"
					dominant-baseline="central"
					x={xs.toFixed(1)}
					y={ys.toFixed(1)}>{p.signature}</text
				>
			{/if}
		{/each}
	{/if}
	<!-- the centre: what is sounding -->
	<circle cx="200" cy="200" r={R_MINOR_IN - 4} class="fill-oxford-900 pointer-events-none" />
	<text
		class="pointer-events-none fill-accent text-18px"
		text-anchor="middle"
		dominant-baseline="central"
		x="200"
		y="200">{centre}</text
	>
	<!-- the key center's mark at twelve o'clock -->
	<circle cx="200" cy="6" r="2.5" class="fill-accent pointer-events-none" />
</svg>
