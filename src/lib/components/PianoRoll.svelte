<script lang="ts">
	import { studio } from "#lib/audio/studio.svelte.js";
	import { editNotes, rollNoteLabel, rollRows, snapRollTime } from "#lib/utils/pianoRoll.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { isTextEntry } from "#lib/utils/isTextEntry.js";
	import type { StudioNote } from "#lib/val/StudioSchema.js";

	/**
	 * The piano-roll editor (docs/multitrack-recorder.md, phase 3b): one
	 * MIDI clip's notes on a grid of pitch rows against time. A click on
	 * empty grid adds a note a grid step long; a note drags along the grid
	 * and across rows; its right edge drags its length; Shift adds to the
	 * selection; Delete removes, the arrow keys nudge (pitch up and down, a
	 * step left and right), Escape clears. Every finished gesture is one
	 * edit on the engine (one undo step). The keyboard column sounds its
	 * note, as does a note picked up, through the track's instrument.
	 */
	interface Props {
		clipId: string;
	}
	let { clipId }: Props = $props();
	const engine = studio;
	let clip = $derived(engine.arrangement.clips.find((c) => c.id === clipId) ?? null);
	let track = $derived(engine.arrangement.tracks.find((t) => t.id === clip?.trackId) ?? null);
	let drums = $derived(track?.input?.source === "drums");
	let notes = $derived(clip?.notes ?? []);
	let rows = $derived(rollRows(notes, drums));

	const ROW_H = 14;
	const KEYS_W = 56;
	let pxPerSecond = $state(120);
	/** The grid step as a fraction of a beat: 1, 1/2 or 1/4; snapping and a new note's length. */
	let division = $state<1 | 2 | 4>(2);
	let step = $derived(engine.beatSeconds / division);
	/** How far the roll runs: the clip's content, a bar of room past it. */
	let seconds = $derived.by(() => {
		let end = clip ? clip.offset + clip.duration : 0;
		for (const n of notes) end = Math.max(end, n.t + n.d);
		return end + engine.barSeconds;
	});
	let width = $derived(Math.ceil(seconds * pxPerSecond));
	let height = $derived(rows.length * ROW_H);
	let rowOf = $derived(new Map(rows.map((r, i) => [r.pitch, i])));
	/** The playhead inside this clip's content, or null when it is elsewhere. */
	let playhead = $derived.by(() => {
		if (!clip || !engine.running) return null;
		const t = engine.position - (clip.start - clip.offset);
		return t >= 0 && t <= seconds ? t : null;
	});

	// ── Selection and gestures ─────────────────────────────────────────────
	let selected = $state<Set<number>>(new Set());
	let lastVelocity = $state(0.8);
	interface Gesture {
		kind: "move" | "resize";
		index: number;
		pointerId: number;
		x0: number;
		y0: number;
		dt: number;
		dp: number;
		dd: number;
		moved: boolean;
	}
	let gesture = $state<Gesture | null>(null);
	let grid = $state<HTMLDivElement | null>(null);

	function clearSelection() {
		selected = new Set();
	}
	/** The edit onto the engine (which sorts the notes), the selection following the notes it held to their new places. */
	function commit(next: StudioNote[]) {
		const kept = [...selected].map((i) => next[i]).filter(Boolean);
		engine.setClipNotes(clipId, next);
		const after = engine.arrangement.clips.find((c) => c.id === clipId)?.notes ?? [];
		const found = new Set<number>();
		for (const k of kept) {
			const i = after.findIndex(
				(n, j) => !found.has(j) && n.t === k.t && n.p === k.p && n.d === k.d && n.v === k.v,
			);
			if (i >= 0) found.add(i);
		}
		selected = found;
	}
	/** The notes as shown: the gesture's preview applied to the selected ones. */
	let shown = $derived.by((): StudioNote[] => {
		const g = gesture;
		if (!g || !g.moved) return notes;
		return g.kind === "move"
			? editNotes(notes, selected, { kind: "move", dt: g.dt, dp: g.dp })
			: editNotes(notes, selected, { kind: "resize", dd: g.dd });
	});
	/** Where a pointer is on the grid element (which scrolls with its wrapper, so its rect already accounts for the scroll). */
	function timeAt(e: PointerEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		return (e.clientX - r.left) / pxPerSecond;
	}
	function pitchAt(e: PointerEvent) {
		const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
		const row = Math.floor((e.clientY - r.top) / ROW_H);
		return rows[Math.max(0, Math.min(rows.length - 1, row))]?.pitch ?? 60;
	}
	/** Empty grid: a new note at the pointer, a grid step long, selected and sounded. */
	function ongriddown(e: PointerEvent) {
		if (e.button !== 0 || !clip || (e.target as HTMLElement).closest("[data-note]")) return;
		const t = e.shiftKey ? timeAt(e) : snapRollTime(timeAt(e), step);
		const p = pitchAt(e);
		const note: StudioNote = { t: round4(t), d: round4(Math.max(0.05, step)), p, v: lastVelocity };
		const next = [...notes, note];
		selected = new Set([next.length - 1]);
		commit(next);
		if (track) engine.auditionNote(track.id, p, lastVelocity);
		grid?.focus();
		e.preventDefault();
	}
	function onnotedown(e: PointerEvent, index: number) {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		const el = e.currentTarget as HTMLElement;
		const rect = el.getBoundingClientRect();
		const resize = rect.width > 18 && rect.right - e.clientX <= 6;
		if (e.shiftKey) {
			const next = new Set(selected);
			if (next.has(index)) next.delete(index);
			else next.add(index);
			selected = next;
		} else if (!selected.has(index)) selected = new Set([index]);
		gesture = {
			kind: resize ? "resize" : "move",
			index,
			pointerId: e.pointerId,
			x0: e.clientX,
			y0: e.clientY,
			dt: 0,
			dp: 0,
			dd: 0,
			moved: false,
		};
		el.setPointerCapture(e.pointerId);
		const n = notes[index];
		if (n && track && !resize) engine.auditionNote(track.id, n.p, n.v);
		grid?.focus();
	}
	function onnotemove(e: PointerEvent) {
		const g = gesture;
		if (!g || e.pointerId !== g.pointerId) return;
		const dx = e.clientX - g.x0;
		const dy = e.clientY - g.y0;
		if (!g.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
		g.moved = true;
		const n = notes[g.index];
		if (!n) return;
		if (g.kind === "move") {
			const raw = n.t + dx / pxPerSecond;
			const t = e.shiftKey ? Math.max(0, raw) : snapRollTime(raw, step);
			g.dt = t - n.t;
			g.dp = -Math.round(dy / ROW_H);
		} else {
			const raw = n.d + dx / pxPerSecond;
			const end = e.shiftKey ? raw : snapRollTime(n.t + raw, step) - n.t;
			g.dd = Math.max(0.05, end) - n.d;
		}
	}
	function onnoteup(e: PointerEvent) {
		const g = gesture;
		if (!g || e.pointerId !== g.pointerId) return;
		gesture = null;
		if (!g.moved) return;
		commit(
			g.kind === "move"
				? editNotes(notes, selected, { kind: "move", dt: g.dt, dp: g.dp })
				: editNotes(notes, selected, { kind: "resize", dd: g.dd }),
		);
	}
	function setVelocity(v: number) {
		lastVelocity = v;
		if (selected.size) commit(editNotes(notes, selected, { kind: "velocity", v }));
	}
	function onkeydown(e: KeyboardEvent) {
		if (isTextEntry(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
		if (e.key === "Escape") {
			clearSelection();
			return;
		}
		if (!selected.size) return;
		if (e.key === "Delete" || e.key === "Backspace") {
			e.preventDefault();
			commit(editNotes(notes, selected, { kind: "delete" }));
			clearSelection();
			return;
		}
		const nudge: Record<string, { dt: number; dp: number }> = {
			ArrowUp: { dt: 0, dp: e.shiftKey ? 12 : 1 },
			ArrowDown: { dt: 0, dp: e.shiftKey ? -12 : -1 },
			ArrowLeft: { dt: -step, dp: 0 },
			ArrowRight: { dt: step, dp: 0 },
		};
		const move = nudge[e.key];
		if (!move) return;
		e.preventDefault();
		commit(editNotes(notes, selected, { kind: "move", ...move }));
	}
	let selectedVelocity = $derived.by(() => {
		const picked = [...selected].map((i) => notes[i]).filter(Boolean);
		if (!picked.length) return lastVelocity;
		return picked.reduce((sum, n) => sum + n.v, 0) / picked.length;
	});
	const round4 = (x: number) => Math.round(x * 10000) / 10000;
	/** On opening, the grid scrolled so the clip's notes sit in view (their middle pitch centred), not the top octave. */
	function centreOnNotes(el: HTMLDivElement) {
		const pitches = notes.map((n) => n.p);
		const mid = pitches.length ? Math.round((Math.min(...pitches) + Math.max(...pitches)) / 2) : 64;
		const row = rowOf.get(mid) ?? Math.floor(rows.length / 2);
		el.scrollTop = Math.max(0, row * ROW_H - el.clientHeight / 2);
	}
	/** Beat lines across the grid, as a repeating background. */
	let beatPx = $derived(engine.beatSeconds * pxPerSecond);
	let barPx = $derived(engine.barSeconds * pxPerSecond);
</script>

<div class="@container flex h-full flex-col gap-2 text-12px" aria-label="Piano roll">
	{#if !clip?.notes}
		<p class="opacity-70 p-2">The clip is gone.</p>
	{:else}
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<span class="font-600 truncate max-w-56" title={clip.name}>{clip.name}</span>
			<span class="opacity-70"
				>{notes.length}
				{notes.length === 1 ? "note" : "notes"}{selected.size
					? ` · ${selected.size} selected`
					: ""}</span
			>
			<label class="flex items-center gap-1">
				Grid
				<select
					class="device-field text-12px py-0"
					aria-label="Grid step"
					value={String(division)}
					onchange={(e) => (division = Number(e.currentTarget.value) as 1 | 2 | 4)}
				>
					<option value="1">beat</option>
					<option value="2">½ beat</option>
					<option value="4">¼ beat</option>
				</select>
			</label>
			<label class="flex items-center gap-1">
				Velocity
				<input
					type="range"
					class="w-24 accent-blue-300"
					min="0.05"
					max="1"
					step="0.01"
					value={selectedVelocity}
					aria-label="Velocity of the selected notes"
					onchange={(e) => setVelocity(e.currentTarget.valueAsNumber)}
				/>
				<span class="tabular-nums w-9">{Math.round(selectedVelocity * 100)}%</span>
			</label>
			<span class="flex items-center gap-1 ml-auto">
				<button
					class="device-button-xs px-2"
					type="button"
					aria-label="Zoom out"
					title="Zoom out"
					onclick={() => (pxPerSecond = Math.max(30, pxPerSecond / 1.5))}
				>
					<span class="i-ph-magnifying-glass-minus" aria-hidden="true"></span>
				</button>
				<button
					class="device-button-xs px-2"
					type="button"
					aria-label="Zoom in"
					title="Zoom in"
					onclick={() => (pxPerSecond = Math.min(600, pxPerSecond * 1.5))}
				>
					<span class="i-ph-magnifying-glass-plus" aria-hidden="true"></span>
				</button>
				<button
					class="device-button-xs px-2"
					type="button"
					disabled={!selected.size}
					title="Remove the selected notes (Delete)"
					onclick={() => {
						commit(editNotes(notes, selected, { kind: "delete" }));
						clearSelection();
					}}
				>
					<span class="i-ph-trash" aria-hidden="true"></span> Remove
				</button>
			</span>
		</div>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_noninteractive_tabindex -->
		<div
			class="relative min-h-0 grow overflow-auto rounded-md border border-white/10 bg-dark select-none outline-none focus-visible:ring-2 focus-visible:ring-playhead"
			role="application"
			aria-label="Notes"
			tabindex="0"
			bind:this={grid}
			{@attach centreOnNotes}
			{onkeydown}
		>
			<div class="relative" style:width="{KEYS_W + width}px" style:height="{height}px">
				<!-- the keyboard column: one row per pitch, a C or a drum voice named; a press sounds it -->
				<div
					class="sticky left-0 z-10 flex flex-col bg-oxford-900 border-r border-white/10"
					style:width="{KEYS_W}px"
					style:height="{height}px"
				>
					{#each rows as row (row.pitch)}
						<button
							type="button"
							class="shrink-0 border-b border-white/5 px-1 text-left text-10px leading-none truncate {row.black
								? 'bg-black/50 text-white/40'
								: 'bg-white/5 text-blue-100/80'}"
							style:height="{ROW_H}px"
							aria-label="Sound {row.label}"
							onclick={() => track && engine.auditionNote(track.id, row.pitch, lastVelocity)}
						>
							{#if drums || row.pitch % 12 === 0}{row.label}{/if}
						</button>
					{/each}
				</div>
				<!-- the grid: rows shaded for black keys, beat and bar lines, the clip's window, the notes -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-0"
					data-roll-grid
					style:left="{KEYS_W}px"
					style:width="{width}px"
					style:height="{height}px"
					style:background-image="repeating-linear-gradient(to bottom, transparent 0, transparent {ROW_H -
						1}px, rgba(255,255,255,0.06) {ROW_H - 1}px, rgba(255,255,255,0.06) {ROW_H}px),
					repeating-linear-gradient(to right, rgba(255,255,255,0.14) 0, rgba(255,255,255,0.14) 1px,
					transparent 1px, transparent {barPx}px), repeating-linear-gradient(to right,
					rgba(255,255,255,0.06) 0, rgba(255,255,255,0.06) 1px, transparent 1px, transparent {beatPx}px)"
					onpointerdown={ongriddown}
				>
					{#each rows as row, i (row.pitch)}
						{#if row.black}
							<div
								class="absolute left-0 right-0 bg-black/25 pointer-events-none"
								style:top="{i * ROW_H}px"
								style:height="{ROW_H}px"
							></div>
						{/if}
					{/each}
					<!-- what the clip shows of its content: the rest is dimmed -->
					{#if clip.offset > 0}
						<div
							class="absolute inset-y-0 left-0 bg-black/40 pointer-events-none"
							style:width="{clip.offset * pxPerSecond}px"
						></div>
					{/if}
					<div
						class="absolute inset-y-0 bg-black/40 pointer-events-none"
						style:left="{(clip.offset + clip.duration) * pxPerSecond}px"
						style:right="0"
					></div>
					{#each shown as note, i (i)}
						{@const row = rowOf.get(note.p) ?? 0}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div
							class="absolute rounded-sm border cursor-grab {selected.has(i)
								? 'border-accent bg-accent/70 ring-1 ring-accent z-10'
								: 'border-blue-200/60 bg-blue-300/60 hover-bg-blue-300/80'}"
							style:left="{note.t * pxPerSecond}px"
							style:top="{row * ROW_H + 1}px"
							style:width="{Math.max(4, note.d * pxPerSecond)}px"
							style:height="{ROW_H - 2}px"
							style:opacity={0.45 + 0.55 * note.v}
							data-note={i}
							role="button"
							tabindex="-1"
							aria-label="{rollNoteLabel(note.p, drums)} at {formatTime(note.t)}, {note.d.toFixed(
								2,
							)} s"
							aria-pressed={selected.has(i)}
							onpointerdown={(e) => onnotedown(e, i)}
							onpointermove={onnotemove}
							onpointerup={onnoteup}
							onpointercancel={onnoteup}
						>
							<div class="absolute inset-y-0 right-0 w-6px cursor-ew-resize"></div>
						</div>
					{/each}
					{#if playhead !== null}
						<div
							class="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
							style:left="{playhead * pxPerSecond}px"
						></div>
					{/if}
				</div>
			</div>
		</div>
		<p class="text-11px text-dim">
			Click to add a note · drag it or its right edge · Shift selects more, Shift-drag ignores the
			grid · arrows nudge (Shift an octave) · Delete removes
		</p>
	{/if}
</div>
