<script lang="ts">
	import type { ChordQuality, CirclePosition } from "#lib/constants/circleOfFifths.js";
	import type { SpelledNote } from "#lib/utils/noteSpelling.js";
	import {
		ARCH_CY,
		ARCH_DOWN_SLOTS,
		ARCH_HEIGHT,
		ARCH_SLOTS,
		ARCH_WIDTH,
		CIRCLE_SIZE,
		CIRCLE_SLOTS,
		R_MAJOR_IN,
		R_MINOR_IN,
		R_OUTER,
		slotCenter,
		slotPath,
		type WedgeSlot,
	} from "#lib/utils/circleGeometry.js";

	/**
	 * The circle of fifths as an SVG instrument (docs/chord-player.md): two
	 * rings of twelve wedges, majors outside and their relative minors
	 * inside, the key signatures around them, the first position at twelve
	 * o'clock. In notes mode the rings become one ring of twelve notes. A
	 * pointer down on a wedge presses it (`onpress`), up or cancel releases
	 * it (`onrelease`); pointer capture keeps a finger that slides off the
	 * wedges on its chord until it lifts, and a glide onto another wedge
	 * lets the first chord go and presses the new one (Kevin). Several
	 * pointers at once.
	 * The arch layout (Kevin) draws the same wedges as slots: the key and
	 * three fifths each way on a bigger arch across the top, the four far
	 * keys as rectangles continuing its ends straight down, the tritone
	 * left out.
	 */
	interface Props {
		positions: CirclePosition[];
		notes: { pitch: number; label: string }[];
		mode: "chords" | "notes";
		/** The circle; the arch (the key at the top); the arch upside down, a bowl with the key at the bottom for a thumb. */
		layout?: "circle" | "arch" | "arch-down";
		showSignatures: boolean;
		/** The wedges' names as the style makes them ("Cmaj7"); the positions' plain labels without. */
		labels?: { major: string; minor: string }[];
		/** The computer keyboard's keys on the wedges, labelled by distance from the key clockwise. */
		showKeys?: boolean;
		keyLabels?: { major: string; minor: string }[];
		/** The key center's drawn index (0 at the top, 6 at the bottom), for the numerals and the highlight. */
		keyIndex?: number;
		/** Roman numerals on every wedge, relative to the key (I, V, II… outside; vi, iii, vii… inside). */
		showNumerals?: boolean;
		/** The chords outside the key dimmed. */
		highlightKey?: boolean;
		/** The ids of the wedges that are sounding (lit). */
		pressed: Set<string>;
		/** The wedge learn mode is waiting for (outlined), by id (docs/chord-player.md, "Learn mode"). */
		target?: string | null;
		/** The text in the centre (the chords sounding). */
		centre: string;
		/** The sounding notes under the name, spelled (docs/chord-player.md, "The readout"). */
		readoutNotes?: SpelledNote[];
		noteReadout?: "names" | "staff" | "both" | "off";
		/** The note the arpeggiator is on (MIDI), lit in the readout; null when it is not running. */
		activeMidi?: number | null;
		onpress: (index: number, quality: ChordQuality, pointerId: number) => void;
		onrelease: (pointerId: number) => void;
		/** A drag up or down within the pressed wedge, in steps: the chord's inversion (0, 1, 2). */
		oninvert?: (index: number, quality: ChordQuality, pointerId: number, inversion: number) => void;
		/** The SVG's own classes (its size; a phone draws it wider than its box so the sides crop flat). */
		class?: string;
	}
	let {
		positions,
		notes,
		mode,
		layout = "circle",
		showSignatures,
		labels = [],
		showKeys = false,
		keyLabels = [],
		keyIndex = 0,
		showNumerals = false,
		highlightKey = false,
		pressed,
		target = null,
		centre,
		readoutNotes = [],
		noteReadout = "names",
		activeMidi = null,
		onpress,
		onrelease,
		oninvert,
		class: svgClass = "w-full",
	}: Props = $props();

	// The circle's radii (a slot scales them to its size) and where the text sits on them.
	/** The signatures run along the rim, inside it by half their height. */
	const SIGNATURE_R = 185;
	const R_MAJOR_TEXT = 162;
	const R_MINOR_TEXT = 101;
	/** The key labels sit under the chord names, the numerals above with a little air (Kevin). */
	const KEY_DY_MAJOR = 15;
	const KEY_DY_MINOR = 12;
	const NUMERAL_DY = -16;

	const slots = $derived(
		layout === "arch" ? ARCH_SLOTS : layout === "arch-down" ? ARCH_DOWN_SLOTS : CIRCLE_SLOTS,
	);
	const box = $derived(
		layout === "arch" || layout === "arch-down"
			? {
					w: ARCH_WIDTH,
					h: ARCH_HEIGHT,
					cx: ARCH_WIDTH / 2,
					cy: layout === "arch" ? ARCH_CY : ARCH_HEIGHT - ARCH_CY,
					scale: 230 / 190,
				}
			: { w: CIRCLE_SIZE, h: CIRCLE_SIZE, cx: 200, cy: 200, scale: 1 },
	);
	/** The readout: the chord name at the hole's centre on every layout (Kevin), lifted a little when the notes show under it; the key mark on the rim at the key. */
	const showNotes = $derived(noteReadout !== "off" && readoutNotes.length > 0);
	const both = $derived(noteReadout === "both");
	/** Which readout note the arpeggiator is on: the note itself, else the same pitch an octave away (the pattern climbing octaves). */
	const activeIndex = $derived.by(() => {
		if (activeMidi === null) return -1;
		const exact = readoutNotes.findIndex((n) => n.midi === activeMidi);
		if (exact >= 0) return exact;
		return readoutNotes.findIndex((n) => n.midi % 12 === activeMidi % 12);
	});
	const readoutY = $derived(box.cy - (showNotes ? (both ? 26 : 16) * box.scale : 0));
	/** The staff under the name (above the names when both show): five lines, a step (a line or a space) half a line apart, the bottom line E4; ledger lines where a note sits off the staff. */
	const STAFF_LINE = 4.2;
	const staffTop = $derived(box.cy + (both ? -8 : 4) * box.scale);
	const staffY = (step: number) => staffTop + (8 - step) * (STAFF_LINE / 2) * box.scale;
	/** With both, the names sit under the staff and clear of its lowest ledger line (a bass root sits well below the staff, Kevin). */
	const namesY = $derived.by(() => {
		if (!both) return box.cy + 8 * box.scale;
		const lowest = Math.max(staffY(-2), ...readoutNotes.map((n) => staffY(n.step)));
		return Math.max(box.cy + 22 * box.scale, lowest + 9 * box.scale);
	});
	const ledgers = (step: number): number[] => {
		const out: number[] = [];
		for (let s = -2; s >= step; s -= 2) out.push(s);
		for (let s = 10; s <= step; s += 2) out.push(s);
		return out;
	};
	const markY = $derived(
		layout === "arch-down" ? box.cy + R_OUTER * box.scale + 4 : box.cy - R_OUTER * box.scale - 4,
	);
	/** Each drawn index with its slot, for the loops (the tritone has none on the arch). */
	const drawn = $derived(
		slots.flatMap((slot, i) => (slot ? [{ i, slot }] : [])) as { i: number; slot: WedgeSlot }[],
	);
	const circleSlot = CIRCLE_SLOTS[0]!;
	/** A font size for a slot: the circle's, scaled, never under 7; a long name ("D♭maj7") shrinks to fit its wedge. */
	const px = (size: number, slot: WedgeSlot, text = "") =>
		Math.max(
			7,
			size *
				(slot.kind === "arc" ? (slot.labelScale ?? slot.scale) : slot.scale) *
				(text.length <= 3 ? 1 : 3.6 / text.length),
		).toFixed(1);
	const majorName = (i: number, p: CirclePosition) => labels[i]?.major ?? p.major.label;
	const minorName = (i: number, p: CirclePosition) => labels[i]?.minor ?? p.minor.label;
	/**
	 * A label's place: a slot's centre at a radius, shifted down by `dy`
	 * (scaled, but never under three quarters, since the small fonts stop
	 * shrinking at 7). A cut end wedge (15°, `labelScale`) has no room for
	 * the usual offsets: its labels sit 14 units off in the major ring and
	 * 11 in the minor, just inside its edges.
	 */
	const at = (slot: WedgeSlot, radius: number, dy = 0) => {
		const [x, y] = slotCenter(slot, radius);
		const tight = slot.kind === "arc" && slot.labelScale !== undefined;
		const off = tight
			? Math.sign(dy) * (Math.abs(dy) >= 15 ? 14 : 11)
			: dy * Math.max(slot.scale, 0.75);
		return { x: x.toFixed(1), y: (y + off).toFixed(1) };
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
	/** The wedge each pointer is on, so a glide knows when it crosses into another; where it went down and the inversion it has dragged to. */
	const under = new Map<number, string>();
	const downAt = new Map<number, { y: number; inversion: number }>();
	/** Pixels of vertical drag per inversion step: short, so both steps fit inside a wedge before the drag reaches the ring above. */
	const INVERSION_STEP = 18;
	function down(e: PointerEvent) {
		const w = wedgeAt(e);
		if (!w) return;
		e.preventDefault();
		(e.currentTarget as SVGSVGElement).setPointerCapture(e.pointerId);
		under.set(e.pointerId, `${w.index}:${w.quality}`);
		downAt.set(e.pointerId, { y: e.clientY, inversion: 0 });
		onpress(w.index, w.quality, e.pointerId);
	}
	/** A captured pointer's events all target the SVG, so the wedge under it is found by point. */
	function move(e: PointerEvent) {
		if (!under.has(e.pointerId)) return;
		const svg = e.currentTarget as SVGSVGElement;
		const el = document
			.elementFromPoint(e.clientX, e.clientY)
			?.closest<SVGPathElement>("[data-index]");
		if (!el || !svg.contains(el)) return;
		const index = Number(el.dataset.index);
		const quality = (el.dataset.quality as ChordQuality) ?? "major";
		const key = `${index}:${quality}`;
		if (under.get(e.pointerId) === key) {
			// Still on the wedge: a drag up turns the chord over (first, then second inversion), down turns it back.
			const start = downAt.get(e.pointerId);
			if (!start || !oninvert || mode === "notes") return;
			const inversion = Math.max(
				0,
				Math.min(2, Math.round((start.y - e.clientY) / INVERSION_STEP)),
			);
			if (inversion !== start.inversion) {
				start.inversion = inversion;
				oninvert(index, quality, e.pointerId, inversion);
			}
			return;
		}
		under.set(e.pointerId, key);
		downAt.set(e.pointerId, { y: e.clientY, inversion: 0 });
		onpress(index, quality, e.pointerId);
	}
	function up(e: PointerEvent) {
		under.delete(e.pointerId);
		downAt.delete(e.pointerId);
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
	onpointermove={move}
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
				class="pointer-events-none {pressed.has(`note:${i}`) ? 'fill-oxford' : 'fill-current'}"
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
					y={k.y}>{keyLabels[(i - keyIndex + 12) % 12]?.major ?? ""}</text
				>
			{/if}
		{/each}
	{:else}
		{#each drawn as { i, slot } (i)}
			{@const p = positions[i]}
			{@const lit = pressed.has(idOf(p, "major"))}
			{@const litMinor = pressed.has(idOf(p, "minor"))}
			<path
				class="cursor-pointer transition-colors {target === idOf(p, 'major')
					? 'stroke-accent stroke-3'
					: 'stroke-oxford-900 stroke-1'} {lit
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
				class="cursor-pointer transition-colors {target === idOf(p, 'minor')
					? 'stroke-accent stroke-3'
					: 'stroke-oxford-900 stroke-1'} {litMinor
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
				font-size={px(22, slot, majorName(i, p))}
				text-anchor="middle"
				dominant-baseline="central"
				x={c1.x}
				y={c1.y}>{majorName(i, p)}</text
			>
			<text
				class="pointer-events-none {pressed.has(idOf(p, 'minor'))
					? 'fill-oxford'
					: dimmed(i)
						? 'fill-current opacity-40'
						: 'fill-current opacity-90'}"
				font-size={px(16, slot, minorName(i, p))}
				text-anchor="middle"
				dominant-baseline="central"
				x={c2.x}
				y={c2.y}>{minorName(i, p)}</text
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
					y={k1.y}>{keyLabels[(i - keyIndex + 12) % 12]?.major ?? ""}</text
				>
				<text
					class="pointer-events-none fill-blue-400"
					font-size={px(9, slot)}
					text-anchor="middle"
					dominant-baseline="central"
					x={k2.x}
					y={k2.y}>{keyLabels[(i - keyIndex + 12) % 12]?.minor ?? ""}</text
				>
			{/if}
			{#if showSignatures && p.signature && slot.kind === "arc" && slot.scale >= 1}
				{@const s = at(slot, SIGNATURE_R)}
				{@const a = (slot.start + slot.end) / 2}
				<!-- along the rim, turned with the wedge (and the right way up on the lower half), so a long one never runs past the edge -->
				<text
					class="pointer-events-none fill-current opacity-60"
					font-size={px(9, slot)}
					text-anchor="middle"
					dominant-baseline="central"
					transform="rotate({((a % 360) + 360) % 360 > 90 && ((a % 360) + 360) % 360 < 270
						? a + 180
						: a} {s.x} {s.y})"
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
		font-size={px(18, { ...circleSlot, scale: box.scale })}
		text-anchor="middle"
		dominant-baseline="central"
		x={box.cx}
		y={readoutY}>{centre}</text
	>
	{#if showNotes && (noteReadout === "names" || both)}
		<text
			class="pointer-events-none fill-current opacity-80"
			font-size={px(11, { ...circleSlot, scale: box.scale })}
			text-anchor="middle"
			dominant-baseline="central"
			x={box.cx}
			y={namesY.toFixed(1)}
			>{#each readoutNotes as n, i (n.midi)}{#if i > 0}{" "}{/if}<tspan
					class={i === activeIndex ? "fill-accent font-bold" : ""}>{n.name}</tspan
				>{/each}</text
		>
	{/if}
	{#if showNotes && (noteReadout === "staff" || both)}
		{@const w = 34 * box.scale}
		{@const dx = Math.min(9 * box.scale, (2 * w) / (readoutNotes.length + 1))}
		{@const x0 = box.cx - (dx * (readoutNotes.length - 1)) / 2}
		<g class="pointer-events-none stroke-current opacity-80" stroke-width="0.6">
			{#each [0, 2, 4, 6, 8] as step (step)}
				<line x1={box.cx - w} x2={box.cx + w} y1={staffY(step)} y2={staffY(step)} />
			{/each}
			{#each readoutNotes as n, i (n.midi)}
				{@const x = x0 + i * dx}
				{#each ledgers(n.step) as s (s)}
					<line x1={x - 4 * box.scale} x2={x + 4 * box.scale} y1={staffY(s)} y2={staffY(s)} />
				{/each}
			{/each}
		</g>
		{#each readoutNotes as n, i (n.midi)}
			{@const x = x0 + i * dx}
			{#if i === activeIndex}
				<circle
					class="pointer-events-none fill-accent/35"
					cx={x.toFixed(1)}
					cy={staffY(n.step).toFixed(1)}
					r={(5 * box.scale).toFixed(1)}
				/>
			{/if}
			<ellipse
				class={i === activeIndex
					? "pointer-events-none fill-white"
					: "pointer-events-none fill-accent"}
				cx={x.toFixed(1)}
				cy={staffY(n.step).toFixed(1)}
				rx={(2.9 * box.scale).toFixed(1)}
				ry={(2 * box.scale).toFixed(1)}
				transform="rotate(-20 {x.toFixed(1)} {staffY(n.step).toFixed(1)})"
			/>
			{#if n.accidental}
				<text
					class="pointer-events-none fill-accent"
					font-size={px(7, { ...circleSlot, scale: box.scale })}
					text-anchor="end"
					dominant-baseline="central"
					x={(x - 3.6 * box.scale).toFixed(1)}
					y={staffY(n.step).toFixed(1)}>{n.accidental}</text
				>
			{/if}
		{/each}
	{/if}
	<!-- the key center's mark on the rim at the key (twelve o'clock, or six on the bowl) -->
	<circle cx={box.cx} cy={markY.toFixed(1)} r="2.5" class="fill-accent pointer-events-none" />
</svg>
