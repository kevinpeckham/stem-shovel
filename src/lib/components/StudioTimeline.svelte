<script lang="ts">
	import LevelMeter from "#lib/components/LevelMeter.svelte";
	import { stemTintHex } from "#lib/constants/stemTints.js";
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
	import { insertsOf } from "#lib/utils/insertsFromFx.js";
	import { clipCrossfades } from "#lib/utils/clipCrossfades.js";
	import type { StudioClip, StudioInput, StudioNote, StudioTrack } from "#lib/val/StudioSchema.js";
	import type { Attachment } from "svelte/attachments";
	import ComboBox from "./ComboBox.svelte";
	import ContextMenu from "./ContextMenu.svelte";
	import StudioTrackMenu from "./StudioTrackMenu.svelte";
	import AutomationLane from "./AutomationLane.svelte";
	import InsertPanel from "./InsertPanel.svelte";
	import Knob from "./Knob.svelte";

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
		/** The selected clip, if any (the last one clicked: the clip bar shows it). */
		selected?: string | null;
		/** Every selected clip (Shift-click adds): dragged, deleted and consolidated together (docs/dawn-daw-plan.md, D4). */
		selectedIds?: string[];
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
		selectedIds = $bindable([]),
		pxPerSecond = $bindable(40),
		onarm,
		onrender,
		onopen,
	}: Props = $props();

	const HEADER_W = 200;
	const LANE_H = 108;
	/** An open automation lane under a track's clips (docs/dawn-daw-plan.md, D1). */
	const AUTO_H = 64;
	/** Which lane each track shows (its key on `automation`), if any; a track's row grows by AUTO_H while one is open. */
	let laneShown = $state<Record<string, string>>({});
	/** Take lanes under a track's clips for comping (D4): one per alternate take of the track's comp clip. */
	const TAKE_H = 44;
	let takesShown = $state<Record<string, boolean>>({});
	function toggleTakes(trackId: string) {
		takesShown = { ...takesShown, [trackId]: !takesShown[trackId] };
	}
	/** The clip whose takes a track's lanes show: the selected clip on it when it has takes, else its first clip with takes. */
	function compClipOf(trackId: string): StudioClip | null {
		const clips = engine.arrangement.clips.filter(
			(c) => c.trackId === trackId && c.alternates?.length,
		);
		return clips.find((c) => c.id === selected) ?? clips[0] ?? null;
	}
	const takeLanes = (trackId: string) =>
		takesShown[trackId] ? (compClipOf(trackId)?.alternates?.length ?? 0) : 0;
	const rowHeight = (trackId: string) =>
		LANE_H + (laneShown[trackId] ? AUTO_H : 0) + takeLanes(trackId) * TAKE_H;
	/** A swipe over a take lane: the region of the comp clip to take from that take. */
	let swipe = $state<{
		clipId: string;
		sourceId: string;
		pointerId: number;
		from: number;
		to: number;
	} | null>(null);
	function onswipedown(e: PointerEvent, clip: StudioClip, sourceId: string) {
		if (e.button !== 0) return;
		const t = secondsAtClientX(e.clientX);
		swipe = { clipId: clip.id, sourceId, pointerId: e.pointerId, from: t, to: t };
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		e.preventDefault();
	}
	function onswipemove(e: PointerEvent) {
		if (!swipe || e.pointerId !== swipe.pointerId) return;
		swipe.to = secondsAtClientX(e.clientX);
	}
	function onswipeup(e: PointerEvent) {
		if (!swipe || e.pointerId !== swipe.pointerId) return;
		const sw = swipe;
		swipe = null;
		const from = Math.min(sw.from, sw.to);
		const to = Math.max(sw.from, sw.to);
		if (to - from < 0.05) return;
		const made = engine.compFromTake(sw.clipId, sw.sourceId, from, to);
		if (made) select(made.id);
	}
	/** The fades as they play, crossfades over overlaps included (utils/clipCrossfades.ts), for the wedges. */
	const fades = $derived(clipCrossfades(studio.arrangement.clips));
	/** One clip selected alone, or added to (Shift) the selection. */
	function select(id: string, add = false) {
		selected = id;
		selectedIds = add ? (selectedIds.includes(id) ? selectedIds : [...selectedIds, id]) : [id];
	}
	function clearSelection() {
		selected = null;
		selectedIds = [];
	}
	function toggleLane(trackId: string) {
		if (laneShown[trackId]) {
			const { [trackId]: _gone, ...rest } = laneShown;
			laneShown = rest;
		} else laneShown = { ...laneShown, [trackId]: "volume" };
	}
	/** The lane the track shows, from what it can show now (utils/automationLanes.ts): the volume when the picked one is gone (its insert removed, say). */
	function laneOf(trackId: string) {
		const lanes = engine.lanesOf(trackId);
		return lanes.find((l) => l.key === laneShown[trackId]) ?? lanes[0];
	}
	/** The rows a vertical drag of `dy` pixels crosses from the track at `index`, with open lanes making rows taller. */
	function rowsAcross(index: number, dy: number): number {
		const tracks = engine.arrangement.tracks;
		let rows = 0;
		let left = dy;
		if (dy > 0) {
			while (index + rows + 1 < tracks.length) {
				const h = rowHeight(tracks[index + rows]!.id);
				if (left < h / 2) break;
				left -= h;
				rows++;
			}
		} else {
			while (index + rows - 1 >= 0) {
				const h = rowHeight(tracks[index + rows - 1]!.id);
				if (-left < h / 2) break;
				left += h;
				rows--;
			}
		}
		return rows;
	}
	/** Pixels a clip dragged `rows` tracks moves, with open lanes making rows taller. */
	function rowsToPx(index: number, rows: number): number {
		const tracks = engine.arrangement.tracks;
		let px = 0;
		if (rows > 0) for (let i = index; i < index + rows; i++) px += rowHeight(tracks[i]!.id);
		else for (let i = index - 1; i >= index + rows; i--) px -= rowHeight(tracks[i]!.id);
		return px;
	}
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
				map: engine.grid,
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
		clearSelection();
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

	/** A recording dragged from the library (LibraryPanel.svelte, D6) lands as a clip at the drop, on an audio track. */
	function onlanedragover(e: DragEvent, track: StudioTrack) {
		if (isMidi(track) || !e.dataTransfer?.types.includes("application/x-stemshovel-source")) return;
		e.preventDefault();
		e.dataTransfer.dropEffect = "copy";
	}
	function onlanedrop(e: DragEvent, track: StudioTrack) {
		const sourceId = e.dataTransfer?.getData("application/x-stemshovel-source");
		if (!sourceId || isMidi(track)) return;
		e.preventDefault();
		const t = secondsAtClientX(e.clientX);
		const made = engine.addClipFromSource(track.id, sourceId, e.shiftKey ? t : engine.snap(t));
		if (made) select(made.id);
	}
	function onlanedown(e: PointerEvent, _track: StudioTrack) {
		if (e.button !== 0 || (e.target as HTMLElement).closest("[data-clip]")) return;
		clearSelection();
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
		if (e.shiftKey && selectedIds.includes(clip.id) && selectedIds.length > 1) {
			// Shift on a selected clip takes it out again.
			selectedIds = selectedIds.filter((id) => id !== clip.id);
			selected = selectedIds[selectedIds.length - 1] ?? null;
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		select(clip.id, e.shiftKey);
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
		const rows = rowsAcross(index, dy);
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
		if (selectedIds.length > 1 && selectedIds.includes(d.clip.id)) {
			engine.moveClips(selectedIds, d.dt, d.rows);
			return;
		}
		const index = tracks.findIndex((t) => t.id === d.clip.trackId);
		const target = tracks[index + d.rows]?.id ?? d.clip.trackId;
		engine.moveClip(d.clip.id, d.clip.start + d.dt, target);
	}
	function onkeydown(e: KeyboardEvent) {
		if (isTextEntry(e.target)) return;
		const chosen = selectedIds.length ? selectedIds : selected ? [selected] : [];
		if ((e.key === "Delete" || e.key === "Backspace") && chosen.length) {
			// Shift closes the gap the clips leave (a ripple delete).
			engine.deleteClips(chosen, e.shiftKey);
			clearSelection();
			e.preventDefault();
		} else if (e.key === "Escape") {
			clearSelection();
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
			// A source that decodes after the clip mounted redraws it; so does a change of the track's tint (the canvas's color).
			$effect(() => {
				void (clip.sourceId && engine.sources[clip.sourceId]?.status);
				void engine.decoding;
				void engine.arrangement.tracks.find((t) => t.id === clip.trackId)?.colour;
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
				// The track's tint is the canvas's color: a change redraws.
				void engine.arrangement.tracks.find((t) => t.id === clip.trackId)?.colour;
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
		// The Practice Amp (docs/practice-amp.md): its sound as heard, stereo.
		{ value: "amp:stereo", label: STUDIO_INPUT_LABELS.amp },
	];
	/** A MIDI track's input is the instrument that plays and records it (phase 3). */
	const MIDI_INPUT_OPTIONS = INPUT_OPTIONS.filter((o) =>
		isInstrument(o.value.split(":")[0] as never),
	);
	/** An audio track may also have no input at all. */
	const AUDIO_INPUT_OPTIONS = [{ value: "", label: "No input" }, ...INPUT_OPTIONS];
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
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions a11y_no_noninteractive_tabindex -->
<div
	class="relative w-full overflow-auto rounded-md border border-white/10 bg-dark select-none outline-none focus-visible:ring-2 focus-visible:ring-playhead"
	style:max-height="min(70vh, {engine.arrangement.tracks.reduce((h, t) => h + rowHeight(t.id), 0) +
		140}px)"
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
			class="sticky left-0 z-30 shrink-0 border-r border-b border-white/10 bg-oxford-900 px-2 text-11px text-light/70 leading-7 truncate"
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
			<!-- Tempo and meter changes (D5): a flag each at the top; double-click edits, Delete on a focused one removes it. -->
			{#each engine.tempoChanges as c (c.start)}
				<button
					type="button"
					class="absolute top-0 z-10 h-3.5 rounded-b px-1 text-9px leading-3.5 bg-blue-300/80 text-dark hover:bg-blue-200 focus-visible:ring-1 focus-visible:ring-white"
					style:left="{c.start * pxPerSecond}px"
					data-tempo-change={c.start}
					aria-label="Tempo change to {c.bpm} bpm at {formatTime(c.start)}"
					title="{c.bpm} bpm from {formatTime(c.start)} (double-click to edit, Delete to remove)"
					onpointerdown={(e) => e.stopPropagation()}
					onclick={() => engine.seek(c.start)}
					ondblclick={() => {
						const v = Number(prompt("Tempo from here, beats per minute", String(c.bpm)));
						if (v) engine.setTempoChange(c.start, v);
					}}
					onkeydown={(e) => {
						if (e.key === "Delete" || e.key === "Backspace") {
							engine.removeTempoChange(c.start);
							e.preventDefault();
							e.stopPropagation();
						}
					}}>{c.bpm}</button
				>
			{/each}
			{#each engine.meterChanges as c (c.start)}
				<button
					type="button"
					class="absolute top-0 z-10 h-3.5 rounded-b px-1 text-9px leading-3.5 bg-green-300/80 text-dark hover:bg-green-200 focus-visible:ring-1 focus-visible:ring-white"
					style:left="{c.start * pxPerSecond + 22}px"
					data-meter-change={c.start}
					aria-label="Meter change to {c.beatsPerBar} beats a bar at {formatTime(c.start)}"
					title="{c.beatsPerBar}/4 from {formatTime(
						c.start,
					)} (double-click to edit, Delete to remove)"
					onpointerdown={(e) => e.stopPropagation()}
					onclick={() => engine.seek(c.start)}
					ondblclick={() => {
						const v = Number(prompt("Beats a bar from here", String(c.beatsPerBar)));
						if (v) engine.setMeterChange(c.start, v);
					}}
					onkeydown={(e) => {
						if (e.key === "Delete" || e.key === "Backspace") {
							engine.removeMeterChange(c.start);
							e.preventDefault();
							e.stopPropagation();
						}
					}}>{c.beatsPerBar}/4</button
				>
			{/each}
			<!-- Markers (D4): a flag each; click jumps there, double-click renames, Delete on a focused one removes it. -->
			{#each engine.markers as m (m.id)}
				<button
					type="button"
					class="absolute bottom-0 z-10 h-4 max-w-32 truncate rounded-t px-1 text-10px leading-4 bg-maximumYellow/80 text-dark hover:bg-maximumYellow focus-visible:ring-1 focus-visible:ring-white"
					style:left="{m.t * pxPerSecond}px"
					data-marker={m.id}
					aria-label="Marker {m.name} at {formatTime(m.t)}"
					title="{m.name} · {formatTime(m.t)} (double-click to rename, Delete to remove)"
					onpointerdown={(e) => e.stopPropagation()}
					onclick={() => engine.seek(m.t)}
					ondblclick={() => {
						const name = prompt("Marker name", m.name);
						if (name) engine.renameMarker(m.id, name);
					}}
					onkeydown={(e) => {
						if (e.key === "Delete" || e.key === "Backspace") {
							// The marker alone: the timeline's own Delete (the selected clips) must not hear it.
							engine.deleteMarker(m.id);
							e.preventDefault();
							e.stopPropagation();
						}
					}}>{m.name}</button
				>
			{/each}
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
		<!-- The track's tint (constants/stemTints.ts, as the stem player's): swatches in its menu, none first. -->
		{@const tint = stemTintHex(track.colour)}
		{@const dim = silenced(track)}
		{#snippet insertsMenu()}
			<!-- The track's inserts (InsertPanel.svelte, docs/dawn-daw-plan.md D2): the whole list to the engine on every change. -->
			<div class="px-3 pt-2 pb-3">
				<InsertPanel
					inserts={insertsOf(track)}
					label={track.name}
					automated={new Set(Object.keys(track.automation ?? {}))}
					onchange={(list) => engine.setInserts(track.id, list)}
				/>
			</div>
		{/snippet}
		<div
			class="flex"
			style:width="{HEADER_W + laneWidth}px"
			style:height="{rowHeight(track.id)}px"
			data-track-row={track.id}
		>
			<!-- the header -->
			<div
				class="sticky left-0 z-10 shrink-0 grid content-between gap-1 overflow-hidden border-r border-b border-white/10 border-l-2 bg-oxford-900 px-2 py-1.5 {track.armed
					? 'border-l-red-500'
					: 'border-l-transparent'}"
				style:width="{HEADER_W}px"
			>
				<div
					class="grid grid-cols-[minmax(0,1fr)_auto_26px] items-center gap-1.5 min-w-0 w-full place-content-center place-items-center"
				>
					<!-- track name -->
					<input
						class="min-w-0 w-full bg-transparent text-13px font-500 text-blue-300 outline-none rounded px-1 hover-bg-white/5 focus-bg-white/10 {dim
							? 'opacity-60'
							: ''}"
						style:color={tint && !dim ? tint : undefined}
						type="text"
						maxlength="60"
						value={track.name}
						aria-label="Track name"
						onchange={(e) => engine.renameTrack(track.id, e.currentTarget.value)}
						onkeydown={(e) => {
							if (e.key === "Enter") e.currentTarget.blur();
						}}
					/>
					<!-- The automation lane under the clips (docs/dawn-daw-plan.md, D1): a MIDI track has no audio path to automate. -->
					{#if !isMidi(track)}
						<button
							type="button"
							class="device-fader-button-sm {laneShown[track.id] ? 'text-accent' : ''}"
							aria-pressed={!!laneShown[track.id]}
							aria-label="Automation for {track.name}"
							title="Automation: a lane of points under the clips for the volume, the pan or the reverb"
							onclick={() => toggleLane(track.id)}>A</button
						>
					{/if}
					<!-- Take lanes for comping (D4), once a clip on the track holds alternate takes. -->
					{#if compClipOf(track.id)}
						<button
							type="button"
							class="device-fader-button-sm {takesShown[track.id] ? 'text-accent' : ''}"
							aria-pressed={!!takesShown[track.id]}
							aria-label="Takes for {track.name}"
							title="Takes: a lane per take under the clip; swipe a region to use that take there"
							onclick={() => toggleTakes(track.id)}>T</button
						>
					{/if}
					<!-- context menu (StudioTrackMenu: the same actions as the Stage's strip) -->
					<StudioTrackMenu {track} {index} {onrender} />
				</div>
				<!-- The input row: the picker alone; the effects button sits with the transport buttons below (Kevin). -->
				<div
					class="grid grid-cols-1 place-content-center place-items-center gap-1.5 min-w-0 w-full"
				>
					<!-- The input picker (ComboBox.svelte), sized and typed as the select it replaced. -->
					<ComboBox
						ariaLabel="{track.name} input"
						options={isMidi(track) ? MIDI_INPUT_OPTIONS : AUDIO_INPUT_OPTIONS}
						value={inputValue(track)}
						disabled={engine.recording}
						onchange={(v) => pickInput(track, v)}
						clearDefaultButtonClasses
						buttonClasses="flex w-full min-w-0 items-center gap-1 h-6 px-1 rounded border border-white/15 bg-oxford-800 text-11px text-left truncate disabled-opacity-60"
						popoverClasses="text-11px"
					/>
				</div>
				<!-- Arm, mute, solo and the effects button lead the fader's row, then the level and pan knobs (Kevin: as the stem player's rows); the meter takes the line below, since the header is narrow. -->
				<div
					class="grid grid-cols-[auto_auto_auto_auto_26px_26px] place-content-center place-items-center gap-1 min-w-0"
				>
					<button
						type="button"
						class="device-fader-button-record-sm"
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
						class="device-fader-button-sm"
						aria-pressed={track.muted}
						aria-label="Mute {track.name}"
						onclick={() => engine.toggleMute(track.id)}>M</button
					>
					<button
						type="button"
						class="device-fader-button-sm"
						aria-pressed={track.solo}
						aria-label="Solo {track.name}"
						onclick={() => engine.toggleSolo(track.id)}>S</button
					>
					{#if isMidi(track)}
						<span
							class="device-fader-button-sm"
							role="img"
							aria-label="MIDI track"
							title="A MIDI track: notes, played through its instrument (its panel has the sound and effects)"
						>
							<span class="i-ph-piano-keys text-13px" aria-hidden="true"></span>
						</span>
					{:else}
						<ContextMenu
							ariaLabel="{track.name} Inserts"
							dataActive={insertsOf(track).length > 0}
							title="Inserts: EQ, compressor, tone, delay, reverb, limiter on this track"
							iconClass="i-ph-sliders-horizontal"
							clearButtonBaseClasses={true}
							buttonClasses="device-fader-menu-button-sm"
							position="bottom left"
							popoverClasses="min-w-72 max-w-sm !max-h-[calc(100vh-2rem)] overflow-y-auto"
							items={[
								{ id: "fx-heading", kind: "heading", label: `${track.name} inserts` },
								{ id: "fx", kind: "snippet", snippet: insertsMenu },
							]}
						/>
					{/if}
					<!-- The fader as a knob (Knob.svelte): the level shows while it turns; a double-click returns to unity. -->
					<Knob
						value={engine.automatedValue(track.id, "volume")}
						min={0}
						max={STUDIO_FADER_MAX}
						step={0.01}
						resetTo={1}
						size={26}
						label="{track.name} level"
						title={isMidi(track)
							? "Level (scales the notes' velocity)"
							: "Level (double-click for unity)"}
						format={levelText(track)}
						oninput={(v) => engine.setGain(track.id, v)}
					/>
					{#if !isMidi(track)}
						<!-- The pan as a knob (Knob.svelte): the value shows in a popover while it turns. -->
						<Knob
							value={engine.automatedValue(track.id, "pan")}
							min={-1}
							max={1}
							step={0.05}
							resetTo={0}
							bipolar
							size={26}
							label="{track.name} pan"
							title="Pan (double-click for center)"
							format={panText}
							oninput={(v) => engine.setPan(track.id, v)}
						/>
					{:else}
						<span class="h-6 w-6" aria-hidden="true"></span>
					{/if}
				</div>
				<!-- The level after the fader, effects and pan, with a peak-hold mark and a clip light that sticks until clicked (as the stem player's). -->
				<LevelMeter
					class="min-w-0 w-full"
					state={engine.levels[track.id]}
					label={track.name}
					onreset={() => engine.resetClips(track.id)}
				/>
				{#if laneShown[track.id]}
					<!-- Which parameter the open lane shows; here in the sticky header, so it stays in view as the lane scrolls. -->
					<ComboBox
						ariaLabel="{track.name} automation parameter"
						options={engine.lanesOf(track.id).map((l) => ({ value: l.key, label: l.range.label }))}
						value={laneOf(track.id)?.key ?? "volume"}
						onchange={(v) => (laneShown = { ...laneShown, [track.id]: v })}
						clearDefaultButtonClasses
						buttonClasses="flex w-full items-center gap-1 h-6 px-1.5 rounded border border-accent/40 bg-oxford-800 text-11px text-accent"
						popoverClasses="text-11px"
					/>
				{/if}
			</div>
			<div class="grid grid-rows-[1fr_auto]" style:width="{laneWidth}px">
				<!-- the lane -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="relative border-b border-white/10 {track.armed ? 'bg-red-500/5' : ''}"
					style:width="{laneWidth}px"
					style:height="{LANE_H}px"
					onpointerdown={(e) => onlanedown(e, track)}
					ondragover={(e) => onlanedragover(e, track)}
					ondrop={(e) => onlanedrop(e, track)}
				>
					{#if engine.arrangement.gridOn}
						{#each ticks as tick (tick.x)}
							{#if tick.major}
								<div class="absolute inset-y-0 w-px bg-white/6" style:left="{tick.x}px"></div>
							{/if}
						{/each}
					{/if}
					{#each clipsOf(track) as clip (clip.id)}
						{@const dragging =
							drag?.clip.id === clip.id ||
							(!!drag && drag.mode === "move" && selectedIds.includes(clip.id))}
						{@const source = clip.sourceId ? engine.sources[clip.sourceId] : undefined}
						{@const shown =
							dragging && drag!.mode === "left" && drag!.moved
								? { start: drag!.edge, duration: clip.start + clip.duration - drag!.edge }
								: dragging && drag!.mode === "right" && drag!.moved
									? { start: clip.start, duration: drag!.edge - clip.start }
									: { start: clip.start, duration: clip.duration }}
						{@const takes = 1 + (clip.alternates?.length ?? 0)}
						{@const f = fades.get(clip.id) ?? {
							fadeIn: clip.fadeIn,
							fadeOut: clip.fadeOut,
							inShape: "linear",
							outShape: "linear",
						}}
						<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
						<div
							class="absolute top-1 bottom-1 rounded-md border overflow-hidden cursor-grab outline-none touch-none {selected ===
							clip.id
								? 'border-accent bg-accent/15 ring-1 ring-accent'
								: selectedIds.includes(clip.id)
									? 'border-accent/70 bg-accent/10'
									: 'border-blue-300/50 bg-blue-300/15 hover-bg-blue-300/20'} {dragging
								? 'cursor-grabbing opacity-80 z-10'
								: ''} {dim ? 'opacity-50' : ''}"
							style:left="{shown.start * pxPerSecond}px"
							style:width="{Math.max(6, shown.duration * pxPerSecond)}px"
							style:transform={dragging && drag!.mode === "move"
								? `translate(${drag!.dt * pxPerSecond}px, ${rowsToPx(index, drag!.rows)}px)`
								: undefined}
							data-clip={clip.id}
							data-selected={selectedIds.includes(clip.id) || undefined}
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
									style:color={tint ?? undefined}
									style:left="{(clip.start - shown.start) * pxPerSecond}px"
									style:width="{Math.max(6, clip.duration * pxPerSecond)}px"
									{@attach noteRoll(clip)}
								></canvas>
							{:else}
								<canvas
									class="absolute top-0 bottom-0 h-full text-blue-200 {source?.status === 'ready'
										? 'opacity-90'
										: 'opacity-30'}"
									style:color={tint ?? undefined}
									style:left="{(clip.start - shown.start) * pxPerSecond}px"
									style:width="{Math.max(6, clip.duration * pxPerSecond)}px"
									{@attach clipWave(clip)}
								></canvas>
							{/if}
							<!-- the fades as they play (a crossfade over an overlap widens them), drawn as wedges over the ends: straight for linear, bowed for equal power -->
							{#if f.fadeIn > 0}
								<div
									class="absolute inset-y-0 left-0 pointer-events-none {f.inShape === 'power'
										? 'bg-[radial-gradient(ellipse_at_bottom_right,transparent_60%,rgba(0,0,0,0.55)_62%)]'
										: 'bg-[linear-gradient(to_bottom_right,rgba(0,0,0,0.55)_50%,transparent_50%)]'}"
									style:width="{f.fadeIn * pxPerSecond}px"
									data-fade-in={f.inShape}
								></div>
							{/if}
							{#if f.fadeOut > 0}
								<div
									class="absolute inset-y-0 right-0 pointer-events-none {f.outShape === 'power'
										? 'bg-[radial-gradient(ellipse_at_bottom_left,transparent_60%,rgba(0,0,0,0.55)_62%)]'
										: 'bg-[linear-gradient(to_bottom_left,rgba(0,0,0,0.55)_50%,transparent_50%)]'}"
									style:width="{f.fadeOut * pxPerSecond}px"
									data-fade-out={f.outShape}
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
				{#if takesShown[track.id] && compClipOf(track.id)}
					{@const comp = compClipOf(track.id)!}
					<!-- The take lanes (D4): each alternate take drawn over the comp clip's span; a swipe takes that region from it (engine.compFromTake). -->
					{#each comp.alternates ?? [] as sourceId (sourceId)}
						{@const take = engine.sources[sourceId]}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							class="relative border-b border-white/10 bg-black/20 touch-none"
							style:height="{TAKE_H}px"
							data-take-lane={sourceId}
							data-take-for={comp.id}
						>
							<!-- svelte-ignore a11y_no_static_element_interactions -->
							<div
								class="absolute top-0.5 bottom-0.5 rounded border border-white/20 bg-white/5 cursor-crosshair overflow-hidden"
								style:left="{comp.start * pxPerSecond}px"
								style:width="{Math.max(6, comp.duration * pxPerSecond)}px"
								role="button"
								tabindex="-1"
								aria-label="Take {take?.label ?? sourceId} for {comp.name ||
									'clip'}: swipe a region to use it"
								onpointerdown={(e) => onswipedown(e, comp, sourceId)}
								onpointermove={onswipemove}
								onpointerup={onswipeup}
								onpointercancel={onswipeup}
							>
								<canvas
									class="absolute inset-0 h-full w-full text-blue-200/70"
									style:color={tint ?? undefined}
									{@attach clipWave({ ...comp, id: `${comp.id}:${sourceId}`, sourceId })}
								></canvas>
								<span
									class="absolute left-1 top-0.5 text-10px leading-none px-1 rounded bg-black/40"
									>{take?.label ?? "take"}</span
								>
								{#if swipe?.clipId === comp.id && swipe.sourceId === sourceId}
									<div
										class="absolute inset-y-0 bg-accent/30 border-x border-accent pointer-events-none"
										style:left="{(Math.min(swipe.from, swipe.to) - comp.start) * pxPerSecond}px"
										style:width="{Math.abs(swipe.to - swipe.from) * pxPerSecond}px"
									></div>
								{/if}
							</div>
						</div>
					{/each}
				{/if}
				{#if laneShown[track.id] && laneOf(track.id)}
					{@const choice = laneOf(track.id)!}
					{@const param = choice.key}
					<!-- The automation lane (AutomationLane.svelte): the parameter's picker over the curve; a click adds a point, the knobs write one at the playhead. -->
					<div
						class="relative border-b border-white/10 bg-black/20"
						style:height="{AUTO_H}px"
						data-automation-for={track.id}
					>
						<AutomationLane
							points={track.automation?.[param] ?? []}
							range={choice.range}
							{pxPerSecond}
							width={laneWidth}
							height={AUTO_H}
							snap={engine.arrangement.gridOn ? (t) => engine.snap(t) : undefined}
							playhead={engine.running ? engine.position : null}
							fallback={engine.automatedValue(track.id, param, 0)}
							label={choice.range.label}
							onchange={(points) => engine.setAutomation(track.id, param, points)}
						/>
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

	<!-- The playhead over every lane: below the sticky headers (z-10) and the ruler, so it hides behind them as the lanes scroll. -->
	<div
		class="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent z-5"
		data-playhead
		style:left="{HEADER_W + playheadX}px"
	></div>
</div>
