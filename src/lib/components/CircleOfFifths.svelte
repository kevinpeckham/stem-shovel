<script lang="ts">
	import type { ChordQuality, CirclePosition } from "$lib/constants/circleOfFifths";
	import {
		ARCH_CY,
		ARCH_HEIGHT,
		ARCH_SLOTS,
		ARCH_WIDTH,
		CIRCLE_SIZE,
		CIRCLE_SLOTS,
		slotCenter,
		slotPath,
		type WedgeSlot,
	} from "$lib/utils/circleGeometry";
	import { CHORD_KEY_LABELS } from "$lib/constants/circleOfFifths";

	/**
	 * The circle of fifths as an SVG instrument (docs/chord-player.md): two
	 * rings of twelve wedges, majors outside and their relative minors
	 * inside, the key signatures around them, the first position at twelve
	 * o'clock. In notes mode the rings become one ring of twelve notes. A
	 * pointer down on a wedge presses it (`onpress`), up or cancel releases
	 * it (`onrelease`); pointer capture keeps a finger that slides off the
	 * wedge on the same chord until it lifts. Several pointers at once.
	 * The arch layout (Kevin) draws the same wedges as slots: the key and
	 * three fifths each way on a bigger arch across the top, the four far
	 * keys small under its ends, the tritone left out.
	 */
	interface Props {
		positions: CirclePosition[];
		notes: { pitch: number; label: string }[];
		mode: "chords" | "notes";
		layout?: "circle" | "arch";
		showSignatures: boolean;
		/** The computer keyboard's keys on the wedges. */
		showKeys?: boolean;
		/** The key center's drawn index (0 at the top, 6 at the bottom), for the numerals and the highlight. */
		keyIndex?: number;
		/** Roman numerals on every wedge, relative to the key (I, V, II… outside; vi, iii, vii… inside). */
		showNumerals?: boolean;
		/** The chords outside the key dimmed. */
		highlightKey?: boolean;
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
		layout = "circle",
		showSignatures,
		showKeys = false,
		keyIndex = 0,
		showNumerals = false,
		highlightKey = false,
		pressed,
		centre,
		onpress,
		onrelease,
		class: svgClass = "w-full",
	}: Props = $props();

	// The circle's radii; a slot scales them to its size.
	const R_OUTER = 190;
	const R_MAJOR_IN = 130;
	const R_MINOR_IN = 72;
	const SIGNATURE_R = 182;
	const R_MAJOR_TEXT = 162;
	const R_MINOR_TEXT = 101;
	/** The key labels sit under the chord names, the numerals above, a few units off. */
	const KEY_DY_MAJOR = 15;
	const KEY_DY_MINOR = 12;
	const NUMERAL_DY = -12;

	const slots = $derived(layout === "arch" ? ARCH_SLOTS : CIRCLE_SLOTS);
	const box = $derived(
		layout === "arch"
			? { w: ARCH_WIDTH, h: ARCH_HEIGHT, cx: ARCH_WIDTH / 2, cy: ARCH_CY, scale: 230 / 190 }
			: { w: CIRCLE_SIZE, h: CIRCLE_SIZE, cx: 200, cy: 200, scale: 1 },
	);
	/** Each drawn index with its slot, for the loops (the tritone has none on the arch). */
	const drawn = $derived(
		slots.flatMap((slot, i) => (slot ? [{ i, slot }] : [])) as { i: number; slot: WedgeSlot }[],
	);
	/** A font size for a slot: the circle's, scaled, never under 7. */
	const px = (size: number, slot: WedgeSlot) => Math.max(7, size * slot.scale).toFixed(1);
	const at = (slot: WedgeSlot, radius: number, dy = 0) => {
		const [x, y] = slotCenter(slot, radius);
		return { x: x.toFixed(1), y: (y + dy * slot.scale).toFixed(1) };
	};

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
	/** Every wedge's numeral by its distance clockwise from the key: the key's own and its two neighbours (IV I V outside, ii vi iii inside) are the diatonic six. */
	const NUMERALS: Record<"major" | "minor", string[]> = {
		major: ["I", "V", "II", "VI", "III", "VII", "♯IV", "♭II", "♭VI", "♭III", "♭VII", "IV"],
		minor: ["vi", "iii", "vii", "♯iv", "♯i", "♯v", "♯ii", "♭vii", "iv", "i", "v", "ii"],
	};
	const numeral = (i: number, quality: "major" | "minor") =>
		NUMERALS[quality][(i - keyIndex + 12) % 12];
	const diatonic = (i: number) => [0, 1, 11].includes((i - keyIndex + 12) % 12);
	const dimmed = (i: number) => highlightKey && !diatonic(i);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<svg
	class="{svgClass} h-auto select-none touch-none"
	style="aspect-ratio: {box.w} / {box.h}"
	viewBox="0 0 {box.w} {box.h}"
	role="application"
	aria-label="Circle of fifths"
	data-layout={layout}
	onpointerdown={down}
	onpointerup={up}
	onpointercancel={up}
	oncontextmenu={(e) => e.preventDefault()}
>
	{#if mode === "notes"}
		{#each drawn as { i, slot } (i)}
			{@const note = notes[i]}
			{@const c = at(slot, (R_MINOR_IN + R_OUTER) / 2)}
			<path
				class="stroke-oxford-900 stroke-1 cursor-pointer transition-colors {pressed.has(`note:${i}`)
					? 'fill-accent'
					: 'fill-slate-800 hover-fill-slate-700'}"
				d={slotPath(slot, R_MINOR_IN, R_OUTER)}
				data-index={i}
				data-quality="major"
				role="button"
				aria-label="{note.label} note"
				aria-pressed={pressed.has(`note:${i}`)}
			/>
			<text
				class="pointer-events-none fill-current"
				font-size={px(22, slot)}
				text-anchor="middle"
				dominant-baseline="central"
				x={c.x}
				y={c.y}>{note.label}</text
			>
			{#if showKeys}
				{@const k = at(slot, (R_MINOR_IN + R_OUTER) / 2, KEY_DY_MAJOR)}
				<text
					class="pointer-events-none fill-blue-400"
					font-size={px(10, slot)}
					text-anchor="middle"
					dominant-baseline="central"
					x={k.x}
					y={k.y}>{CHORD_KEY_LABELS[i].major}</text
				>
			{/if}
		{/each}
	{:else}
		{#each drawn as { i, slot } (i)}
			{@const p = positions[i]}
			{@const lit = pressed.has(idOf(p, "major"))}
			{@const litMinor = pressed.has(idOf(p, "minor"))}
			<path
				class="stroke-oxford-900 stroke-1 cursor-pointer transition-colors {lit
					? 'fill-accent'
					: dimmed(i)
						? 'fill-slate-900 hover-fill-slate-800'
						: 'fill-slate-800 hover-fill-slate-700'}"
				d={slotPath(slot, R_MAJOR_IN, R_OUTER)}
				data-index={i}
				data-quality="major"
				role="button"
				aria-label="{p.major.label} major"
				aria-pressed={lit}
			/>
			<path
				class="stroke-oxford-900 stroke-1 cursor-pointer transition-colors {litMinor
					? 'fill-accent'
					: dimmed(i)
						? 'fill-slate-800 hover-fill-slate-700'
						: 'fill-slate-700 hover-fill-slate-600'}"
				d={slotPath(slot, R_MINOR_IN, R_MAJOR_IN)}
				data-index={i}
				data-quality="minor"
				role="button"
				aria-label="{p.minor.label} minor"
				aria-pressed={litMinor}
			/>
		{/each}
		{#each drawn as { i, slot } (i)}
			{@const p = positions[i]}
			{@const c1 = at(slot, R_MAJOR_TEXT)}
			{@const c2 = at(slot, R_MINOR_TEXT)}
			{@const inKey = diatonic(i)}
			<text
				class="pointer-events-none {pressed.has(idOf(p, 'major'))
					? 'fill-oxford'
					: dimmed(i)
						? 'fill-current opacity-40'
						: 'fill-current'}"
				font-size={px(22, slot)}
				text-anchor="middle"
				dominant-baseline="central"
				x={c1.x}
				y={c1.y}>{p.major.label}</text
			>
			<text
				class="pointer-events-none {pressed.has(idOf(p, 'minor'))
					? 'fill-oxford'
					: dimmed(i)
						? 'fill-current opacity-40'
						: 'fill-current opacity-90'}"
				font-size={px(16, slot)}
				text-anchor="middle"
				dominant-baseline="central"
				x={c2.x}
				y={c2.y}>{p.minor.label}</text
			>
			{#if showNumerals}
				{@const n1 = at(slot, R_MAJOR_TEXT, NUMERAL_DY)}
				{@const n2 = at(slot, R_MINOR_TEXT, NUMERAL_DY + 3)}
				<text
					class="pointer-events-none tracking-wide {pressed.has(idOf(p, 'major'))
						? 'fill-oxford'
						: inKey
							? 'fill-accent opacity-90'
							: 'fill-current opacity-55'}"
					font-size={px(10, slot)}
					text-anchor="middle"
					dominant-baseline="central"
					x={n1.x}
					y={n1.y}>{numeral(i, "major")}</text
				>
				<text
					class="pointer-events-none tracking-wide {pressed.has(idOf(p, 'minor'))
						? 'fill-oxford'
						: inKey
							? 'fill-accent opacity-90'
							: 'fill-current opacity-55'}"
					font-size={px(9, slot)}
					text-anchor="middle"
					dominant-baseline="central"
					x={n2.x}
					y={n2.y}>{numeral(i, "minor")}</text
				>
			{/if}
			{#if showKeys}
				{@const k1 = at(slot, R_MAJOR_TEXT, KEY_DY_MAJOR)}
				{@const k2 = at(slot, R_MINOR_TEXT, KEY_DY_MINOR)}
				<text
					class="pointer-events-none fill-blue-400"
					font-size={px(10, slot)}
					text-anchor="middle"
					dominant-baseline="central"
					x={k1.x}
					y={k1.y}>{CHORD_KEY_LABELS[i].major}</text
				>
				<text
					class="pointer-events-none fill-blue-400"
					font-size={px(9, slot)}
					text-anchor="middle"
					dominant-baseline="central"
					x={k2.x}
					y={k2.y}>{CHORD_KEY_LABELS[i].minor}</text
				>
			{/if}
			{#if showSignatures && p.signature && slot.scale >= 1}
				{@const s = at(slot, SIGNATURE_R)}
				<text
					class="pointer-events-none fill-current opacity-60"
					font-size={px(9, slot)}
					text-anchor="middle"
					dominant-baseline="central"
					x={s.x}
					y={s.y}>{p.signature}</text
				>
			{/if}
		{/each}
	{/if}
	<!-- the centre: what is sounding -->
	<circle
		cx={box.cx}
		cy={box.cy}
		r={((R_MINOR_IN - 4) * box.scale).toFixed(1)}
		class="fill-oxford-900 pointer-events-none"
	/>
	<text
		class="pointer-events-none fill-accent"
		font-size={px(18, { ...CIRCLE_SLOTS[0]!, scale: box.scale })}
		text-anchor="middle"
		dominant-baseline="central"
		x={box.cx}
		y={layout === "arch" ? box.cy - 24 : box.cy}>{centre}</text
	>
	<!-- the key center's mark at twelve o'clock -->
	<circle
		cx={box.cx}
		cy={(box.cy - R_OUTER * box.scale - 4).toFixed(1)}
		r="2.5"
		class="fill-accent pointer-events-none"
	/>
</svg>
