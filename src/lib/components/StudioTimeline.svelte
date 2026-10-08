<script lang="ts">
	import { STUDIO_FADER_MAX } from "#lib/constants/studio.js";
	import {
		isInstrument,
		LIVE_PEAK_FRAMES,
		studio,
		STUDIO_INPUT_LABELS,
		STUDIO_INSTRUMENTS,
	} from "#lib/audio/studio.svelte.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { rulerTicks } from "#lib/utils/rulerTicks.js";
	import { isTextEntry } from "#lib/utils/isTextEntry.js";
	import { defaultTrackFx, trackFxActive } from "#lib/audio/trackChain.js";
	import type {
		StudioClip,
		StudioInput,
		StudioNote,
		StudioTrack,
		StudioTrackFx,
	} from "#lib/val/StudioSchema.js";
	import type { Attachment } from "svelte/attachments";
	import ContextMenu from "./ContextMenu.svelte";
	import Knob from "./Knob.svelte";
	import Slider from "./Slider.svelte";

	/**
	 * The Studio's timeline (docs/multitrack-recorder.md, "The page"): a
	 * ruler over one row per track, each a header (name, arm, mute, solo,
	 * input, fader, pan, meter) that sticks to the left and a lane holding
	 * the track's clips at `pxPerSecond`. One container scrolls both ways;
	 * the playhead is one element over every lane. A clip drags along its
	 * lane (snapped to the beat when the grid is on; Shift frees it) and
	 * onto another track; a press on empty lane or on the ruler seeks;
	 * Delete removes the selected clip. The loop region sits on the ruler
	 * with its ends draggable.
	 */
	interface Props {
		/** The selected clip, if any. */
		selected?: string | null;
		pxPerSecond?: number;
		/** Ask for the input of a track (the page opens the microphone from the gesture). */
		onarm?: (track: StudioTrack) => void;
		/** Render a MIDI track to an audio track (the track's menu; the page says what happened). */
		onrender?: (track: StudioTrack) => void;
		/** Open a MIDI clip's notes in the piano-roll editor (a double-click on the clip). */
		onopen?: (clip: StudioClip) => void;
	}
	let {
		selected = $bindable(null),
		pxPerSecond = $bindable(40),
		onarm,
		onrender,
		onopen,
	}: Props = $props();

	const HEADER_W = 184;
	const LANE_H = 108;
	const engine = studio;
	let scroller = $state<HTMLDivElement | null>(null);
	let viewWidth = $state(0);
	// The lanes stretch past the last clip so there is room to record and to scroll.
	let laneSeconds = $derived(
		Math.max(engine.duration + 30, (viewWidth - HEADER_W) / pxPerSecond, 60),
	);
	let laneWidth = $derived(Math.ceil(laneSeconds * pxPerSecond));
	let playheadX = $derived(engine.position * pxPerSecond);

	// ── The ruler ──────────────────────────────────────────────────────────
	let ticks = $derived(
		rulerTicks({
			seconds: laneSeconds,
			pxPerSecond,
			grid: {
				on: engine.arrangement.gridOn,
				bpm: engine.arrangement.bpm,
				beatsPerBar: engine.arrangement.beatsPerBar,
			},
		}),
	);

	// ── Seeking and scrubbing on the ruler or an empty lane ────────────────
	function secondsAtClientX(clientX: number) {
		if (!scroller) return 0;
		const rect = scroller.getBoundingClientRect();
		const x = clientX - rect.left - HEADER_W + scroller.scrollLeft;
		return Math.max(0, x / pxPerSecond);
	}
	let scrubbing = false;
	function onrulerdown(e: PointerEvent) {
		if (e.button !== 0) return;
		const t = secondsAtClientX(e.clientX);
		const edge = loopEdgeAt(t);
		if (edge) {
			loopDrag = edge;
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			e.preventDefault();
			return;
		}
		scrubbing = true;
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		engine.seek(e.shiftKey ? t : engine.snap(t));
		selected = null;
		e.preventDefault();
	}
	function onrulermove(e: PointerEvent) {
		if (loopDrag) {
			const loop = engine.arrangement.loop;
			if (!loop) return;
			const t = e.shiftKey ? secondsAtClientX(e.clientX) : engine.snap(secondsAtClientX(e.clientX));
			loopPreview =
				loopDrag === "start"
					? { start: Math.min(t, loop.end - 0.1), end: loop.end }
					: { start: loop.start, end: Math.max(t, loop.start + 0.1) };
			return;
		}
		if (!scrubbing) return;
		const t = secondsAtClientX(e.clientX);
		engine.seek(e.shiftKey ? t : engine.snap(t));
	}
	function onrulerup() {
		scrubbing = false;
		if (loopDrag && loopPreview) {
			const loop = engine.arrangement.loop;
			engine.setLoop({ on: loop?.on ?? true, ...loopPreview });
		}
		loopDrag = null;
		loopPreview = null;
	}
	// The loop region's ends on the ruler.
	let loopDrag = $state<"start" | "end" | null>(null);
	let loopPreview = $state<{ start: number; end: number } | null>(null);
	function loopEdgeAt(t: number): "start" | "end" | null {
		const loop = engine.arrangement.loop;
		if (!loop) return null;
		const grab = 8 / pxPerSecond;
		if (Math.abs(t - loop.start) <= grab) return "start";
		if (Math.abs(t - loop.end) <= grab) return "end";
		return null;
	}
	let loopShown = $derived(
		loopPreview
			? { ...loopPreview, on: engine.arrangement.loop?.on ?? true }
			: engine.arrangement.loop,
	);

	function onlanedown(e: PointerEvent, _track: StudioTrack) {
		if (e.button !== 0 || (e.target as HTMLElement).closest("[data-clip]")) return;
		selected = null;
		const t = secondsAtClientX(e.clientX);
		engine.seek(e.shiftKey ? t : engine.snap(t));
	}

	// ── Clips: select and drag ─────────────────────────────────────────────
	interface Drag {
		clip: StudioClip;
		pointerId: number;
		startX: number;
		startY: number;
		/** Moving the clip, or trimming one of its edges (a press within a few pixels of it). */
		mode: "move" | "left" | "right";
		/** The preview: the offset in seconds (a move), or the edge's new time (a trim), and the rows down. */
		dt: number;
		edge: number;
		rows: number;
		moved: boolean;
	}
	const EDGE_PX = 7;
	let drag = $state<Drag | null>(null);
	function onclipdown(e: PointerEvent, clip: StudioClip) {
		if (e.button !== 0) return;
		selected = clip.id;
		const el = e.currentTarget as HTMLElement;
		el.focus({ preventScroll: true });
		const rect = el.getBoundingClientRect();
		const mode =
			rect.width > EDGE_PX * 3 && e.clientX - rect.left <= EDGE_PX
				? "left"
				: rect.width > EDGE_PX * 3 && rect.right - e.clientX <= EDGE_PX
					? "right"
					: "move";
		drag = {
			clip,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			mode,
			dt: 0,
			edge: mode === "right" ? clip.start + clip.duration : clip.start,
			rows: 0,
			moved: false,
		};
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
		e.stopPropagation();
	}
	function onclipmove(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const dx = e.clientX - drag.startX;
		const dy = e.clientY - drag.startY;
		if (!drag.moved && Math.abs(dx) < 3 && Math.abs(dy) < 3) return;
		drag.moved = true;
		if (drag.mode !== "move") {
			const at =
				(drag.mode === "left" ? drag.clip.start : drag.clip.start + drag.clip.duration) +
				dx / pxPerSecond;
			drag.edge = e.shiftKey ? Math.max(0, at) : engine.snap(at);
			return;
		}
		const raw = drag.clip.start + dx / pxPerSecond;
		const start = e.shiftKey ? Math.max(0, raw) : engine.snap(raw);
		drag.dt = start - drag.clip.start;
		const index = engine.arrangement.tracks.findIndex((t) => t.id === drag!.clip.trackId);
		const rows = Math.round(dy / LANE_H);
		drag.rows = Math.max(-index, Math.min(engine.arrangement.tracks.length - 1 - index, rows));
	}
	function onclipup(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		const d = drag;
		drag = null;
		if (!d.moved) return;
		if (d.mode === "left") {
			engine.trimClip(d.clip.id, { start: d.edge });
			return;
		}
		if (d.mode === "right") {
			engine.trimClip(d.clip.id, { end: d.edge });
			return;
		}
		const tracks = engine.arrangement.tracks;
		const index = tracks.findIndex((t) => t.id === d.clip.trackId);
		const target = tracks[index + d.rows]?.id ?? d.clip.trackId;
		engine.moveClip(d.clip.id, d.clip.start + d.dt, target);
	}
	function onkeydown(e: KeyboardEvent) {
		if (isTextEntry(e.target)) return;
		if ((e.key === "Delete" || e.key === "Backspace") && selected) {
			engine.deleteClip(selected);
			selected = null;
			e.preventDefault();
		} else if (e.key === "Escape") {
			selected = null;
		}
	}
	/** ⌘/Ctrl + wheel zooms around the pointer; a plain wheel scrolls. */
	function onwheel(e: WheelEvent) {
		if (!(e.metaKey || e.ctrlKey) || !scroller) return;
		e.preventDefault();
		const t = secondsAtClientX(e.clientX);
		const next = Math.max(4, Math.min(400, pxPerSecond * (e.deltaY < 0 ? 1.15 : 1 / 1.15)));
		const rect = scroller.getBoundingClientRect();
		pxPerSecond = next;
		// Keep the second under the pointer where it is.
		scroller.scrollLeft = t * next - (e.clientX - rect.left - HEADER_W);
	}
	// fallow-ignore-next-line policy-violation:stem-shovel-house-rules/svelte-effect-last-resort -- scrolls the container as the engine's clock moves, which no handler sees
	// Keep the playhead in view while the transport runs.
	$effect(() => {
		const x = playheadX;
		if (!scroller || !engine.running) return;
		const visible = scroller.clientWidth - HEADER_W;
		if (x < scroller.scrollLeft || x > scroller.scrollLeft + visible - 40)
			scroller.scrollLeft = Math.max(0, x - 80);
	});

	// ── Waveforms: each clip draws its span of its source ──────────────────
	/** Min/max per pixel from the decoded buffer (a few milliseconds a clip), else the stored peaks. */
	function clipWave(clip: StudioClip): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			let key = "";
			const draw = () => {
				const w = canvas.clientWidth;
				const h = canvas.clientHeight;
				if (!w || !h || !clip.sourceId) return;
				const buffer = engine.bufferOf(clip.sourceId);
				const source = engine.sources[clip.sourceId];
				const next = `${clip.sourceId}:${clip.offset}:${clip.duration}:${w}:${h}:${buffer ? "b" : "p"}`;
				if (next === key) return;
				key = next;
				const dpr = devicePixelRatio || 1;
				canvas.width = Math.round(w * dpr);
				canvas.height = Math.round(h * dpr);
				const g = canvas.getContext("2d");
				if (!g) return;
				g.scale(dpr, dpr);
				g.clearRect(0, 0, w, h);
				g.fillStyle = getComputedStyle(canvas).color;
				const mid = h / 2;
				if (buffer) {
					const sr = buffer.sampleRate;
					const from = Math.floor(clip.offset * sr);
					const span = Math.max(1, Math.floor(clip.duration * sr));
					const per = span / w;
					const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
						buffer.getChannelData(c),
					);
					// At most 64 samples looked at per pixel: enough for a peak, cheap when zoomed out.
					const step = Math.max(1, Math.floor(per / 64));
					for (let x = 0; x < w; x++) {
						const a = from + Math.floor(x * per);
						const b = Math.min(buffer.length, from + Math.floor((x + 1) * per));
						let lo = 0;
						let hi = 0;
						for (const data of chans)
							for (let i = a; i < b; i += step) {
								const v = data[i];
								if (v > hi) hi = v;
								else if (v < lo) lo = v;
							}
						const top = mid - hi * (mid - 1);
						const bottom = mid - lo * (mid - 1);
						g.fillRect(x, top, 1, Math.max(1, bottom - top));
					}
				} else if (source) {
					const peaks = source.peaks;
					const n = peaks.length;
					const total = source.durationSeconds || clip.offset + clip.duration;
					for (let x = 0; x < w; x++) {
						const t = clip.offset + (x / w) * clip.duration;
						const p = peaks[Math.min(n - 1, Math.floor((t / total) * n))] ?? 0;
						const amp = p * (mid - 1);
						g.fillRect(x, mid - amp, 1, Math.max(1, amp * 2));
					}
				}
			};
			draw();
			const ro = new ResizeObserver(draw);
			ro.observe(canvas);
			// A source that decodes after the clip mounted redraws it.
			$effect(() => {
				void (clip.sourceId && engine.sources[clip.sourceId]?.status);
				void engine.decoding;
				draw();
			});
			return () => ro.disconnect();
		};
	}

	/** A MIDI clip as a small piano roll: the notes the clip shows (from its offset, its length), a row per semitone of their range. */
	function noteRoll(clip: StudioClip): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			let key = "";
			const draw = () => {
				const w = canvas.clientWidth;
				const h = canvas.clientHeight;
				const notes = clip.notes ?? [];
				if (!w || !h) return;
				const next = `${clip.id}:${clip.offset}:${clip.duration}:${w}:${h}:${notes.length}:${notes.map((n) => n.t + n.p).join(",").length}`;
				if (next === key) return;
				key = next;
				const dpr = devicePixelRatio || 1;
				canvas.width = Math.round(w * dpr);
				canvas.height = Math.round(h * dpr);
				const g = canvas.getContext("2d");
				if (!g) return;
				g.scale(dpr, dpr);
				g.clearRect(0, 0, w, h);
				drawRoll(
					g,
					notes.filter((n) => n.t + n.d > clip.offset && n.t < clip.offset + clip.duration),
					{ w, h, origin: clip.offset, seconds: clip.duration },
					getComputedStyle(canvas).color,
				);
			};
			draw();
			const ro = new ResizeObserver(draw);
			ro.observe(canvas);
			$effect(() => {
				void clip.notes?.length;
				void pxPerSecond;
				draw();
			});
			return () => ro.disconnect();
		};
	}
	/** The MIDI take under way: the notes played so far, redrawn as each lands. */
	function liveNotes(trackId: string): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			const draw = () => {
				const notes = engine.liveNotesOf(trackId);
				const w = canvas.clientWidth;
				const h = canvas.clientHeight;
				if (!w || !h) return;
				const dpr = devicePixelRatio || 1;
				if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
					canvas.width = Math.round(w * dpr);
					canvas.height = Math.round(h * dpr);
				}
				const g = canvas.getContext("2d");
				if (!g) return;
				g.setTransform(dpr, 0, 0, dpr, 0, 0);
				g.clearRect(0, 0, w, h);
				drawRoll(
					g,
					notes,
					{ w, h, origin: 0, seconds: w / pxPerSecond },
					getComputedStyle(canvas).color,
				);
			};
			$effect(() => {
				void engine.liveTick;
				void pxPerSecond;
				draw();
			});
		};
	}
	/** The take under way: the engine's live peaks (one per LIVE_PEAK_FRAMES) bucketed to the band's pixels, redrawn as chunks land. */
	function liveWave(trackId: string): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			const draw = () => {
				const peaks = engine.livePeaksOf(trackId);
				const w = canvas.clientWidth;
				const h = canvas.clientHeight;
				if (!w || !h) return;
				const dpr = devicePixelRatio || 1;
				if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
					canvas.width = Math.round(w * dpr);
					canvas.height = Math.round(h * dpr);
				}
				const g = canvas.getContext("2d");
				if (!g) return;
				g.setTransform(dpr, 0, 0, dpr, 0, 0);
				g.clearRect(0, 0, w, h);
				g.fillStyle = getComputedStyle(canvas).color;
				const mid = h / 2;
				const secondsPerPeak = LIVE_PEAK_FRAMES / engine.sampleRate;
				const perPx = 1 / (pxPerSecond * secondsPerPeak); // peaks per pixel
				const px = Math.min(w, Math.ceil(peaks.length / perPx));
				for (let x = 0; x < px; x++) {
					const a = Math.floor(x * perPx);
					const b = Math.min(peaks.length, Math.max(a + 1, Math.floor((x + 1) * perPx)));
					let p = 0;
					for (let i = a; i < b; i++) if (peaks[i] > p) p = peaks[i];
					const amp = Math.min(1, p) * (mid - 1);
					g.fillRect(x, mid - amp, 1, Math.max(1, amp * 2));
				}
			};
			$effect(() => {
				void engine.liveTick;
				void pxPerSecond;
				draw();
			});
		};
	}

	function clipsOf(track: StudioTrack) {
		return engine.arrangement.clips.filter((c) => c.trackId === track.id);
	}
	function inputValue(t: StudioTrack) {
		return t.input ? `${t.input.source}:${t.input.channel}` : "";
	}
	function pickInput(t: StudioTrack, value: string) {
		if (!value) {
			engine.setInput(t.id, null);
			return;
		}
		const [source, channel] = value.split(":") as [StudioInput["source"], StudioInput["channel"]];
		engine.setInput(t.id, { source, channel });
		if (t.armed) onarm?.(t);
	}
	const INPUT_OPTIONS: { value: string; label: string }[] = [
		...(["mic", "line", "computer"] as const).flatMap((s) => [
			{ value: `${s}:stereo`, label: `${STUDIO_INPUT_LABELS[s]} · stereo` },
			{ value: `${s}:left`, label: `${STUDIO_INPUT_LABELS[s]} · left` },
			{ value: `${s}:right`, label: `${STUDIO_INPUT_LABELS[s]} · right` },
		]),
		// The hosted instruments, stereo as they sound (docs/multitrack-recorder.md, phase 2).
		...STUDIO_INSTRUMENTS.map((s) => ({ value: `${s}:stereo`, label: STUDIO_INPUT_LABELS[s] })),
	];
	/** A MIDI track's input is the instrument that plays and records it (phase 3). */
	const MIDI_INPUT_OPTIONS = INPUT_OPTIONS.filter((o) =>
		isInstrument(o.value.split(":")[0] as never),
	);
	const isMidi = (t: StudioTrack) => t.kind === "midi";
	/** A fader's level as its slider says it: decibels for audio, a share for a MIDI track's velocity. */
	const levelText = (t: StudioTrack) => (v: number) =>
		isMidi(t)
			? `${Math.round(v * 100)}%`
			: v <= 0.001
				? "−∞ dB"
				: `${Math.round(20 * Math.log10(v))} dB`;
	/** A pan as the knob says it: L 50, C, R 50. */
	const panText = (v: number) =>
		v === 0 ? "C" : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`;
	/** The pitch range a clip's roll spans: its notes', at least an octave, a semitone of room each side. */
	function pitchSpan(notes: StudioNote[]): { lo: number; hi: number } {
		let lo = 127;
		let hi = 0;
		for (const n of notes) {
			if (n.p < lo) lo = n.p;
			if (n.p > hi) hi = n.p;
		}
		if (lo > hi) return { lo: 48, hi: 72 };
		const mid = (lo + hi) / 2;
		if (hi - lo < 12) {
			lo = Math.floor(mid - 6);
			hi = Math.ceil(mid + 6);
		}
		return { lo: Math.max(0, lo - 1), hi: Math.min(127, hi + 1) };
	}
	/** Notes as rectangles: time along x from `origin` at `pxPerSecond`, pitch down y over the span's rows; velocity lightens them. */
	function drawRoll(
		g: CanvasRenderingContext2D,
		notes: StudioNote[],
		box: { w: number; h: number; origin: number; seconds: number },
		colour: string,
	) {
		const { lo, hi } = pitchSpan(notes);
		const rows = hi - lo + 1;
		const rowH = box.h / rows;
		for (const n of notes) {
			const x = (n.t - box.origin) * pxPerSecond;
			const w = Math.max(2, n.d * pxPerSecond);
			if (x + w < 0 || x > box.w) continue;
			const y = (hi - n.p) * rowH;
			g.globalAlpha = 0.45 + 0.55 * n.v;
			g.fillStyle = colour;
			g.fillRect(
				Math.max(0, x),
				y + 0.5,
				Math.min(w, box.w - Math.max(0, x)),
				Math.max(1, rowH - 1),
			);
		}
		g.globalAlpha = 1;
	}
	function silenced(t: StudioTrack) {
		return t.muted || (engine.anySolo && !t.solo);
	}
	/** The track's effects as they stand (every effect off when it has none), and a setter for one field. */
	function fxOf(t: StudioTrack): StudioTrackFx {
		return t.fx ?? defaultTrackFx();
	}
	function setFx<K extends keyof StudioTrackFx>(
		t: StudioTrack,
		group: K,
		patch: Partial<StudioTrackFx[K]>,
	) {
		const fx = structuredClone($state.snapshot(fxOf(t)));
		Object.assign(fx[group], patch);
		engine.setTrackFx(t.id, fx);
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_noninteractive_tabindex -->
<div
	class="relative w-full overflow-auto rounded-md border border-white/10 bg-dark select-none outline-none focus-visible:ring-2 focus-visible:ring-playhead"
	style:max-height="min(70vh, {engine.arrangement.tracks.length * LANE_H + 140}px)"
	role="application"
	aria-label="Timeline"
	tabindex="0"
	bind:this={scroller}
	bind:clientWidth={viewWidth}
	{onkeydown}
	{onwheel}
>
	<!-- The ruler: sticky at the top; the corner sticks at the left as the headers do. -->
	<div class="sticky top-0 z-20 flex h-7 bg-oxford-900" style:width="{HEADER_W + laneWidth}px">
		<div
			class="sticky left-0 z-30 shrink-0 border-r border-b border-white/10 bg-oxford-900 px-2 text-11px opacity-70 leading-7 truncate"
			style:width="{HEADER_W}px"
		>
			{engine.arrangement.gridOn
				? `${engine.arrangement.bpm} bpm · ${engine.arrangement.beatsPerBar}/4`
				: "Free time"}
		</div>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative h-full border-b border-white/10 cursor-text touch-none"
			style:width="{laneWidth}px"
			onpointerdown={onrulerdown}
			onpointermove={onrulermove}
			onpointerup={onrulerup}
			onpointercancel={onrulerup}
		>
			{#if loopShown}
				<div
					class="absolute inset-y-0 border-x-2 {loopShown.on
						? 'bg-accent/25 border-accent'
						: 'bg-white/5 border-white/30'}"
					style:left="{loopShown.start * pxPerSecond}px"
					style:width="{Math.max(2, (loopShown.end - loopShown.start) * pxPerSecond)}px"
					title="Loop region: drag its ends"
				></div>
			{/if}
			{#each ticks as tick (tick.x)}
				<div
					class="absolute bottom-0 {tick.major ? 'h-3 bg-white/40' : 'h-1.5 bg-white/20'} w-px"
					style:left="{tick.x}px"
				></div>
				{#if tick.label}
					<span
						class="absolute top-0.5 text-10px tabular-nums opacity-70 pl-1 leading-none"
						style:left="{tick.x}px">{tick.label}</span
					>
				{/if}
			{/each}
		</div>
	</div>

	{#each engine.arrangement.tracks as track, index (track.id)}
		{@const level = engine.levels[track.id] ?? 0}
		{@const dim = silenced(track)}
		{#snippet fxMenu()}
			{@const fx = fxOf(track)}
			<div
				class="px-3 pt-2 pb-4 grid gap-4 text-13px [&_span.device-button-label]-(block mb-1 text-blue-100/90) [&_input[type=range]]-(w-full accent-maximumYellow)"
			>
				<div class="grid gap-2">
					<span class="device-button-label">Compressor</span>
					<label class="block">
						<span class="text-11px opacity-70"
							>Amount · {Math.round(fx.compressor.amount * 100)}%</span
						>
						<input
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={fx.compressor.amount}
							aria-label="{track.name} compressor amount"
							oninput={(e) => setFx(track, "compressor", { amount: e.currentTarget.valueAsNumber })}
						/>
					</label>
					<label class="block">
						<span class="text-11px opacity-70">Ratio · {fx.compressor.ratio}:1</span>
						<input
							type="range"
							min="1"
							max="20"
							step="1"
							value={fx.compressor.ratio}
							aria-label="{track.name} compressor ratio"
							oninput={(e) => setFx(track, "compressor", { ratio: e.currentTarget.valueAsNumber })}
						/>
					</label>
					<label class="block">
						<span class="text-11px opacity-70">Make-up · {fx.compressor.makeup} dB</span>
						<input
							type="range"
							min="0"
							max="24"
							step="1"
							value={fx.compressor.makeup}
							aria-label="{track.name} compressor make-up gain"
							oninput={(e) => setFx(track, "compressor", { makeup: e.currentTarget.valueAsNumber })}
						/>
					</label>
				</div>
				<div class="grid gap-2">
					<span class="device-button-label">Tone</span>
					<label class="block">
						<span class="text-11px opacity-70"
							>Tilt · {fx.tone.tilt < 0 ? "dark" : fx.tone.tilt > 0 ? "bright" : "flat"}</span
						>
						<input
							type="range"
							min="-1"
							max="1"
							step="0.05"
							value={fx.tone.tilt}
							aria-label="{track.name} tone tilt"
							oninput={(e) => setFx(track, "tone", { tilt: e.currentTarget.valueAsNumber })}
							ondblclick={() => setFx(track, "tone", { tilt: 0 })}
						/>
					</label>
					<label class="block">
						<span class="text-11px opacity-70">Air · {Math.round(fx.tone.air * 100)}%</span>
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={fx.tone.air}
							aria-label="{track.name} tone air"
							oninput={(e) => setFx(track, "tone", { air: e.currentTarget.valueAsNumber })}
						/>
					</label>
					<label class="block">
						<span class="text-11px opacity-70">Bottom · {Math.round(fx.tone.bottom * 100)}%</span>
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={fx.tone.bottom}
							aria-label="{track.name} tone bottom"
							oninput={(e) => setFx(track, "tone", { bottom: e.currentTarget.valueAsNumber })}
						/>
					</label>
				</div>
				<div class="grid gap-2">
					<span class="device-button-label">Reverb</span>
					<label class="block">
						<span class="text-11px opacity-70">Level · {Math.round(fx.reverb.level * 100)}%</span>
						<input
							type="range"
							min="0"
							max="1"
							step="0.01"
							value={fx.reverb.level}
							aria-label="{track.name} reverb level"
							oninput={(e) => setFx(track, "reverb", { level: e.currentTarget.valueAsNumber })}
						/>
					</label>
					<label class="block">
						<span class="text-11px opacity-70"
							>Size · {fx.reverb.size < 0.34
								? "a room"
								: fx.reverb.size < 0.67
									? "a hall"
									: "a cathedral"}</span
						>
						<input
							type="range"
							min="0"
							max="1"
							step="0.05"
							value={fx.reverb.size}
							aria-label="{track.name} reverb size"
							onchange={(e) => setFx(track, "reverb", { size: e.currentTarget.valueAsNumber })}
						/>
					</label>
				</div>
				<button
					class="button button-xs justify-self-start"
					type="button"
					onclick={() => engine.setTrackFx(track.id, defaultTrackFx())}
				>
					<span class="i-ph-arrow-counter-clockwise" aria-hidden="true"></span> Reset effects
				</button>
			</div>
		{/snippet}
		<div class="flex" style:width="{HEADER_W + laneWidth}px" style:height="{LANE_H}px">
			<!-- the header -->
			<div
				class="sticky left-0 z-10 shrink-0 grid content-between gap-1 overflow-hidden border-r border-b border-white/10 bg-oxford-900 px-2 py-1.5 {track.armed
					? 'shadow-[inset_3px_0_0_0_theme(colors.red.500)]'
					: ''}"
				style:width="{HEADER_W}px"
			>
				<div class="flex items-center gap-1 min-w-0">
					<input
						class="min-w-0 w-0 grow bg-transparent text-13px font-500 text-blue-300 outline-none rounded px-1 hover-bg-white/5 focus-bg-white/10 {dim
							? 'opacity-60'
							: ''}"
						type="text"
						maxlength="60"
						value={track.name}
						aria-label="Track name"
						onchange={(e) => engine.renameTrack(track.id, e.currentTarget.value)}
						onkeydown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
						}}
					/>
					<button
						type="button"
						class="h-6 w-6 shrink-0 rounded border text-11px font-600 transition-colors {track.armed
							? 'bg-red-600 border-red-600 text-white'
							: 'border-white/25 hover-border-red-400 text-red-300'}"
						aria-pressed={track.armed}
						aria-label="Arm {track.name} for recording"
						title="Arm for recording"
						disabled={engine.recording}
						onclick={() => {
							engine.toggleArm(track.id);
							const t = engine.arrangement.tracks.find((x) => x.id === track.id);
							if (t?.armed) onarm?.(t);
						}}
					>
						●
					</button>
					<button
						type="button"
						class="h-6 w-6 shrink-0 rounded border border-white/25 text-11px font-500 transition-colors hover-border-white/60 {track.muted
							? 'bg-blue-300 text-oxford border-blue-300'
							: ''}"
						aria-pressed={track.muted}
						aria-label="Mute {track.name}"
						onclick={() => engine.toggleMute(track.id)}>M</button
					>
					<button
						type="button"
						class="h-6 w-6 shrink-0 rounded border border-white/25 text-11px font-600 transition-colors hover-border-white/60 {track.solo
							? 'bg-accent text-oxford border-accent'
							: ''}"
						aria-pressed={track.solo}
						aria-label="Solo {track.name}"
						onclick={() => engine.toggleSolo(track.id)}>S</button
					>
					{#if isMidi(track)}
						<span
							class="h-6 w-6 shrink-0 rounded border border-blue-300/30 flex items-center justify-center text-blue-200"
							role="img"
							aria-label="MIDI track"
							title="A MIDI track: notes, played through its instrument (its panel has the sound and effects)"
						>
							<span class="i-ph-piano-keys text-13px" aria-hidden="true"></span>
						</span>
					{:else}
						<ContextMenu
							ariaLabel="{track.name} effects"
							title="Compressor, tone and reverb for this track"
							iconClass="i-ph-sliders-horizontal"
							buttonBaseClasses="button button-xs px-1 shrink-0 {trackFxActive(track.fx)
								? 'text-accent opacity-100'
								: 'opacity-70 hover-opacity-100'}"
							position="bottom left"
							popoverClasses="min-w-72 max-w-sm !max-h-[calc(100vh-2rem)] overflow-y-auto"
							items={[
								{ id: "fx-heading", kind: "heading", label: `${track.name} effects` },
								{ id: "fx", kind: "snippet", snippet: fxMenu },
							]}
						/>
					{/if}
					<ContextMenu
						ariaLabel="{track.name} actions"
						buttonBaseClasses="button button-xs opacity-70 hover-opacity-100 px-1 shrink-0"
						position="bottom right"
						items={[
							{
								id: "up",
								kind: "button",
								label: "Move up",
								iconClass: "i-ph-arrow-up",
								disabled: index === 0,
								action: () => engine.moveTrack(track.id, index - 1),
							},
							{
								id: "down",
								kind: "button",
								label: "Move down",
								iconClass: "i-ph-arrow-down",
								disabled: index === engine.arrangement.tracks.length - 1,
								action: () => engine.moveTrack(track.id, index + 1),
							},
							{ id: "d", kind: "divider" },
							{
								id: "render",
								kind: "button",
								label: "Render to audio track",
								iconClass: "i-ph-waveform",
								title:
									"Play the notes through the instrument into a new audio track (in real time), so the song can bounce",
								condition: isMidi(track),
								disabled: engine.running || !clipsOf(track).some((c) => c.notes?.length),
								action: () => onrender?.(track),
							},
							{
								id: "remove",
								kind: "button",
								label: "Remove track",
								iconClass: "i-ph-trash",
								action: () => {
									const n = clipsOf(track).length;
									if (
										n &&
										!confirm(`Remove “${track.name}” and its ${n} ${n === 1 ? "clip" : "clips"}?`)
									)
										return;
									engine.removeTrack(track.id);
								},
							},
						]}
					/>
				</div>
				<select
					class="w-full min-w-0 bg-oxford-800 rounded text-11px px-1 h-6 border border-white/15 truncate"
					aria-label="{track.name} input"
					value={inputValue(track)}
					disabled={engine.recording}
					onchange={(e) => pickInput(track, e.currentTarget.value)}
				>
					{#if isMidi(track)}
						{#each MIDI_INPUT_OPTIONS as o (o.value)}<option value={o.value}>{o.label}</option
							>{/each}
					{:else}
						<option value="">No input</option>
						{#each INPUT_OPTIONS as o (o.value)}<option value={o.value}>{o.label}</option>{/each}
					{/if}
				</select>
				<div class="flex items-center gap-1.5 min-w-0">
					<!-- The fader as a slider (Slider.svelte): the level pops up over the thumb while it moves; a double-click returns to unity. -->
					<Slider
						value={track.gain}
						min={0}
						max={STUDIO_FADER_MAX}
						step={0.01}
						resetTo={1}
						thickness={5}
						label="{track.name} level"
						title={isMidi(track)
							? "Level (scales the notes' velocity)"
							: "Level (double-click for unity)"}
						format={levelText(track)}
						oninput={(v) => engine.setGain(track.id, v)}
						class="min-w-0 grow"
					/>
					{#if !isMidi(track)}
						<!-- The pan as a knob (Knob.svelte): the value shows in a popover while it turns. -->
						<Knob
							value={track.pan}
							min={-1}
							max={1}
							step={0.05}
							resetTo={0}
							bipolar
							size={26}
							label="{track.name} pan"
							title="Pan (double-click for centre)"
							format={panText}
							oninput={(v) => engine.setPan(track.id, v)}
						/>
					{/if}
				</div>
				<div class="h-1 w-full rounded bg-blue-100/10 overflow-hidden" aria-hidden="true">
					<div
						class="h-full rounded {level > 0.85 ? 'bg-red-500' : 'bg-blue-300'}"
						style:width="{level * 100}%"
					></div>
				</div>
			</div>
			<!-- the lane -->
			<!-- svelte-ignore a11y_no_static_element_interactions -->
			<div
				class="relative border-b border-white/10 {track.armed ? 'bg-red-500/5' : ''}"
				style:width="{laneWidth}px"
				onpointerdown={(e) => onlanedown(e, track)}
			>
				{#if engine.arrangement.gridOn}
					{#each ticks as tick (tick.x)}
						{#if tick.major}
							<div class="absolute inset-y-0 w-px bg-white/6" style:left="{tick.x}px"></div>
						{/if}
					{/each}
				{/if}
				{#each clipsOf(track) as clip (clip.id)}
					{@const dragging = drag?.clip.id === clip.id}
					{@const source = clip.sourceId ? engine.sources[clip.sourceId] : undefined}
					{@const shown =
						dragging && drag!.mode === "left" && drag!.moved
							? { start: drag!.edge, duration: clip.start + clip.duration - drag!.edge }
							: dragging && drag!.mode === "right" && drag!.moved
								? { start: clip.start, duration: drag!.edge - clip.start }
								: { start: clip.start, duration: clip.duration }}
					{@const takes = 1 + (clip.alternates?.length ?? 0)}
					<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
					<div
						class="absolute top-1 bottom-1 rounded-md border overflow-hidden cursor-grab outline-none touch-none {selected ===
						clip.id
							? 'border-accent bg-accent/15 ring-1 ring-accent'
							: 'border-blue-300/50 bg-blue-300/15 hover-bg-blue-300/20'} {dragging
							? 'cursor-grabbing opacity-80 z-10'
							: ''} {dim ? 'opacity-50' : ''}"
						style:left="{shown.start * pxPerSecond}px"
						style:width="{Math.max(6, shown.duration * pxPerSecond)}px"
						style:transform={dragging && drag!.mode === "move"
							? `translate(${drag!.dt * pxPerSecond}px, ${drag!.rows * LANE_H}px)`
							: undefined}
						data-clip={clip.id}
						role="button"
						tabindex="0"
						aria-label="{clip.name || 'Clip'} at {formatTime(clip.start)}{clip.notes
							? ` (${clip.notes.length} ${clip.notes.length === 1 ? 'note' : 'notes'})`
							: ''}"
						title="{clip.name} · {formatTime(clip.start)} – {formatTime(
							clip.start + clip.duration,
						)}"
						onpointerdown={(e) => onclipdown(e, clip)}
						onpointermove={onclipmove}
						onpointerup={onclipup}
						onpointercancel={onclipup}
						ondblclick={() => clip.notes && onopen?.(clip)}
					>
						<!-- The drawing keeps the clip's own width and place while an edge is dragged, so the trim masks it (the clip's overflow is hidden) rather than squeezing it; it is redrawn once the trim lands. -->
						{#if clip.notes}
							<canvas
								class="absolute top-0 bottom-0 h-full text-blue-200 opacity-90"
								style:left="{(clip.start - shown.start) * pxPerSecond}px"
								style:width="{Math.max(6, clip.duration * pxPerSecond)}px"
								{@attach noteRoll(clip)}
							></canvas>
						{:else}
							<canvas
								class="absolute top-0 bottom-0 h-full text-blue-200 {source?.status === 'ready'
									? 'opacity-90'
									: 'opacity-30'}"
								style:left="{(clip.start - shown.start) * pxPerSecond}px"
								style:width="{Math.max(6, clip.duration * pxPerSecond)}px"
								{@attach clipWave(clip)}
							></canvas>
						{/if}
						<!-- the fades, drawn as wedges over the ends -->
						{#if clip.fadeIn > 0}
							<div
								class="absolute inset-y-0 left-0 pointer-events-none bg-[linear-gradient(to_bottom_right,rgba(0,0,0,0.55)_50%,transparent_50%)]"
								style:width="{clip.fadeIn * pxPerSecond}px"
							></div>
						{/if}
						{#if clip.fadeOut > 0}
							<div
								class="absolute inset-y-0 right-0 pointer-events-none bg-[linear-gradient(to_bottom_left,rgba(0,0,0,0.55)_50%,transparent_50%)]"
								style:width="{clip.fadeOut * pxPerSecond}px"
							></div>
						{/if}
						<!-- the trim handles -->
						<div class="absolute inset-y-0 left-0 w-7px cursor-ew-resize"></div>
						<div class="absolute inset-y-0 right-0 w-7px cursor-ew-resize"></div>
						<span
							class="absolute left-1 top-0.5 text-10px leading-none truncate max-w-[calc(100%-8px)] px-1 rounded bg-black/40"
						>
							{clip.name}{takes > 1 ? ` · ${takes} takes` : ""}{source?.pending
								? " · saving…"
								: source?.status === "failed"
									? " · not loaded"
									: ""}
						</span>
					</div>
				{/each}
				<!-- a take on its way: the red band grows from where recording began, its waveform drawn as the chunks arrive -->
				{#if track.armed && (engine.phase === "recording" || engine.phase === "counting")}
					<div
						class="absolute top-1 bottom-1 rounded-md border border-red-500 bg-red-500/20 pointer-events-none overflow-hidden"
						style:left="{engine.recordFrom * pxPerSecond}px"
						style:width="{Math.max(2, (engine.position - engine.recordFrom) * pxPerSecond)}px"
					>
						{#if isMidi(track)}
							<canvas
								class="absolute inset-0 h-full w-full text-red-200 opacity-90"
								{@attach liveNotes(track.id)}
							></canvas>
						{:else}
							<canvas
								class="absolute inset-0 h-full w-full text-red-200 opacity-90"
								{@attach liveWave(track.id)}
							></canvas>
						{/if}
					</div>
				{/if}
			</div>
		</div>
	{/each}
	{#if engine.arrangement.tracks.length === 0}
		<div class="px-4 py-10 text-center text-dim text-14px" style:width="{HEADER_W + laneWidth}px">
			No tracks yet. Add one and arm it to record.
		</div>
	{/if}

	<!-- the playhead over every lane -->
	<div
		class="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent z-15"
		style:left="{HEADER_W + playheadX}px"
	></div>
</div>
