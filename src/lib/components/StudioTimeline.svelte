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
	import { GAIN_ENVELOPE_MAX, gainEnvelopeAt, gainEnvelopeWith } from "#lib/utils/gainEnvelope.js";
	import type {
		StudioClip,
		StudioGainPoint,
		StudioInput,
		StudioNote,
		StudioTrack,
	} from "#lib/val/StudioSchema.js";
	import type { Attachment } from "svelte/attachments";
	import ComboBox from "./ComboBox.svelte";
	import ContextMenu from "./ContextMenu.svelte";
	import { clipNoteEvents } from "#lib/utils/clipNoteEvents.js";
	import { clipSegments } from "#lib/utils/clipSegments.js";
	import { warpKey, warpSourceAt, warpUniformRatio } from "#lib/audio/warp.js";
	import StudioTrackMenu from "./StudioTrackMenu.svelte";
	import StudioGroupRow from "./StudioGroupRow.svelte";
	import { studioRows, type StudioRow } from "#lib/utils/studioRows.js";
	import { busDescendants } from "#lib/utils/busDescendants.js";
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
	 * with its ends draggable; an Alt-drag on the ruler selects a time range
	 * that Delete, Shift+Delete and Insert act on across every track.
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
		/** Freeze a track into one rendering, or thaw it (D8; the page says what happened). */
		onfreeze?: (track: StudioTrack) => void;
		onunfreeze?: (track: StudioTrack) => void;
		/** Open a MIDI clip's notes in the piano-roll editor (a double-click on the clip). */
		onopen?: (clip: StudioClip) => void;
		/** Comments pinned to moments (D7), drawn on the ruler; a click seeks there and opens the thread. */
		comments?: { id: string; at: number; by: string }[];
		oncomment?: (id: string) => void;
		/** The selected clip's gain envelope shown and edited (docs/multitrack-recorder.md "Clip gain envelopes"): a press on the clip adds a point. */
		envelope?: boolean;
		/** A time range selected on the ruler (Alt-drag; docs/multitrack-recorder.md "Range edits"): the page's Range tools act on it. */
		range?: { start: number; end: number } | null;
	}
	let {
		selected = $bindable(null),
		selectedIds = $bindable([]),
		pxPerSecond = $bindable(40),
		envelope = $bindable(false),
		range = $bindable(null),
		onarm,
		onrender,
		onfreeze,
		onunfreeze,
		onopen,
		comments = [],
		oncomment,
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
	/** A group's row (StudioGroupRow.svelte, docs/multitrack-recorder.md "Folder tracks"). */
	const GROUP_H = 28;
	/** The rows as shown: tracks under their groups, a folded group's tracks left out (utils/studioRows.ts). */
	const rows = $derived(studioRows(studio.arrangement, studio.collapsed));
	const rowHeightOf = (row: StudioRow) =>
		row.kind === "group" ? GROUP_H : rowHeight(row.track.id);
	/** Where a track's row sits among the rows shown; −1 when folded away. */
	const rowIndexOf = (trackId: string) =>
		rows.findIndex((r) => r.kind === "track" && r.track.id === trackId);
	/** The clips of every track under a group, for its sketch. */
	function groupClipsOf(busId: string): StudioClip[] {
		const within = busDescendants(studio.arrangement.buses ?? [], busId);
		const ids = new Set(
			studio.arrangement.tracks.filter((t) => t.output && within.has(t.output)).map((t) => t.id),
		);
		return studio.arrangement.clips.filter((c) => ids.has(c.trackId));
	}
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
	/** The rows shown that a vertical drag of `dy` pixels crosses from the row at `index`, with open lanes making rows taller. */
	function rowsAcross(index: number, dy: number): number {
		let n = 0;
		let left = dy;
		if (dy > 0) {
			while (index + n + 1 < rows.length) {
				const h = rowHeightOf(rows[index + n]!);
				if (left < h / 2) break;
				left -= h;
				n++;
			}
		} else {
			while (index + n - 1 >= 0) {
				const h = rowHeightOf(rows[index + n - 1]!);
				if (-left < h / 2) break;
				left += h;
				n--;
			}
		}
		// A clip lands on a track: a group's row passes it on in the drag's direction, or back if none lies that way.
		const dir = n > 0 ? 1 : -1;
		let at = index + n;
		while (at >= 0 && at < rows.length && rows[at]!.kind === "group") at += dir;
		if (at < 0 || at >= rows.length) {
			at = index + n;
			while (at !== index && rows[at]!.kind === "group") at -= dir;
		}
		return at - index;
	}
	/** Pixels a clip dragged `n` rows moves, with open lanes making rows taller. */
	function rowsToPx(index: number, n: number): number {
		let px = 0;
		if (n > 0) for (let i = index; i < index + n; i++) px += rowHeightOf(rows[i]!);
		else for (let i = index - 1; i >= index + n; i--) px -= rowHeightOf(rows[i]!);
		return px;
	}
	const engine = studio;
	/** The mix rows under the tracks (docs/multitrack-recorder.md, "Wider automation"): a bus's and the master's lanes have no clips, only a header and, open, a lane. */
	const MIX_H = 32;
	const mixRows = $derived([
		...(engine.arrangement.buses ?? []).map((b) => ({
			id: b.id,
			name: b.name,
			kind: "bus" as const,
		})),
		{ id: "master", name: "Master", kind: "master" as const },
	]);
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
	/** Where an Alt-drag on the ruler began (the range's anchor), while one runs. */
	let rangeFrom: number | null = null;
	/** The range from the anchor to `t`, ordered and at least 0.05 s long. */
	function rangeTo(t: number) {
		const from = rangeFrom ?? t;
		const start = Math.min(from, t);
		return { start, end: Math.max(start + 0.05, Math.max(from, t)) };
	}
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
		if (e.altKey) {
			// Alt-drag selects a range (snapped unless Shift); the clip selection gives way to it.
			rangeFrom = e.shiftKey ? t : engine.snap(t);
			range = rangeTo(rangeFrom);
			(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
			clearSelection();
			e.preventDefault();
			return;
		}
		range = null;
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
		if (rangeFrom !== null) {
			const t = secondsAtClientX(e.clientX);
			range = rangeTo(e.shiftKey ? t : engine.snap(t));
			return;
		}
		if (!scrubbing) return;
		const t = secondsAtClientX(e.clientX);
		engine.seek(e.shiftKey ? t : engine.snap(t));
	}
	function onrulerup() {
		scrubbing = false;
		rangeFrom = null;
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
		/** Moving the clip, trimming one of its edges (a press within a few pixels of it), or stretching it (Alt on the right edge). */
		mode: "move" | "left" | "right" | "stretch";
		/** The preview: the offset in seconds (a move), or the edge's new time (a trim), and the rows down. */
		dt: number;
		edge: number;
		rows: number;
		moved: boolean;
	}
	const EDGE_PX = 7;
	let drag = $state<Drag | null>(null);
	/** What a press on a clip begins: a trim at either edge (within a few pixels), a stretch with Alt on the right edge of an audio clip (docs/multitrack-recorder.md "Warping a clip"), else a move. */
	function pressModeOf(e: PointerEvent, rect: DOMRect, clip: StudioClip): Drag["mode"] {
		if (rect.width <= EDGE_PX * 3) return "move";
		if (e.clientX - rect.left <= EDGE_PX) return "left";
		if (rect.right - e.clientX > EDGE_PX) return "move";
		return e.altKey && clip.sourceId ? "stretch" : "right";
	}
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
		const mode = pressModeOf(e, el.getBoundingClientRect(), clip);
		if (mode === "move" && e.altKey && clip.sourceId) {
			// Alt on the clip's body: a warp marker there (docs/multitrack-recorder.md "Warping a clip", editing markers).
			engine.addWarpPoint(clip.id, clip.offset + (secondsAtClientX(e.clientX) - clip.start));
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		if (mode === "move" && wearsEnvelope(clip)) {
			// With the gain line shown, a press on the clip's body sets a point there, at the line's own value.
			const t = clip.offset + (secondsAtClientX(e.clientX) - clip.start);
			engine.setClipGainEnvelope(
				clip.id,
				gainEnvelopeWith(clip.gainEnvelope, { t, v: gainEnvelopeAt(clip.gainEnvelope, t) }),
			);
			e.preventDefault();
			e.stopPropagation();
			return;
		}
		drag = {
			clip,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			mode,
			dt: 0,
			edge: mode === "right" || mode === "stretch" ? clip.start + clip.duration : clip.start,
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
		const index = rowIndexOf(drag.clip.trackId);
		if (index < 0) return;
		drag.rows = Math.max(-index, Math.min(rows.length - 1 - index, rowsAcross(index, dy)));
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
		if (d.mode === "stretch") {
			engine.stretchClipTo(d.clip.id, d.edge - d.clip.start);
			return;
		}
		const tracks = engine.arrangement.tracks;
		// The row the clip landed on, as a track (rowsAcross never lands on a group), then the step in the track list.
		const landed = rows[rowIndexOf(d.clip.trackId) + d.rows];
		const target = landed?.kind === "track" ? landed.track.id : d.clip.trackId;
		const step =
			tracks.findIndex((t) => t.id === target) - tracks.findIndex((t) => t.id === d.clip.trackId);
		if (selectedIds.length > 1 && selectedIds.includes(d.clip.id)) {
			engine.moveClips(selectedIds, d.dt, step);
			return;
		}
		engine.moveClip(d.clip.id, d.clip.start + d.dt, target);
	}
	// ── Warp markers (docs/multitrack-recorder.md "Warping a clip", editing markers) ──
	interface MarkerDrag {
		clip: StudioClip;
		index: number;
		pointerId: number;
		startX: number;
		/** The marker's content second as it is dragged (the preview). */
		at: number;
		moved: boolean;
	}
	let markerDrag = $state<MarkerDrag | null>(null);
	/** The selected clip's warp points inside what it shows, with their indexes in the warp. */
	function warpMarkersOf(clip: StudioClip): { index: number; at: number }[] {
		if (!clip.warp) return [];
		const end = clip.offset + clip.duration;
		return clip.warp
			.map((p, index) => ({ index, at: p.at }))
			.filter((m) => m.at > clip.offset + 0.001 && m.at < end - 0.001);
	}
	function markerAt(clip: StudioClip, m: { index: number; at: number }): number {
		return markerDrag?.clip.id === clip.id && markerDrag.index === m.index ? markerDrag.at : m.at;
	}
	function onmarkerdown(e: PointerEvent, clip: StudioClip, index: number) {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		if (e.altKey) {
			engine.removeWarpPoint(clip.id, index);
			return;
		}
		const el = e.currentTarget as HTMLElement;
		el.focus({ preventScroll: true });
		el.setPointerCapture(e.pointerId);
		markerDrag = {
			clip,
			index,
			pointerId: e.pointerId,
			startX: e.clientX,
			at: clip.warp![index]!.at,
			moved: false,
		};
	}
	function onmarkermove(e: PointerEvent) {
		if (!markerDrag || e.pointerId !== markerDrag.pointerId) return;
		const d = markerDrag;
		const dx = e.clientX - d.startX;
		if (!d.moved && Math.abs(dx) < 2) return;
		d.moved = true;
		// The marker's place on the timeline snaps to the grid unless Shift is held, as a clip does.
		const raw = d.clip.warp![d.index]!.at + dx / pxPerSecond;
		const timeline = d.clip.start + raw - d.clip.offset;
		const snapped = e.shiftKey ? timeline : engine.snap(timeline);
		d.at = Math.max(0, snapped - d.clip.start + d.clip.offset);
	}
	function onmarkerup(e: PointerEvent) {
		if (!markerDrag || e.pointerId !== markerDrag.pointerId) return;
		const d = markerDrag;
		markerDrag = null;
		if (d.moved) engine.moveWarpPoint(d.clip.id, d.index, d.at);
	}
	function onmarkerkey(e: KeyboardEvent, clip: StudioClip, index: number) {
		const p = clip.warp?.[index];
		if (!p) return;
		if (e.key === "Delete" || e.key === "Backspace") {
			engine.removeWarpPoint(clip.id, index);
		} else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
			// A hundredth of a second a step, a tenth with Shift.
			const step = (e.shiftKey ? 0.1 : 0.01) * (e.key === "ArrowLeft" ? -1 : 1);
			engine.moveWarpPoint(clip.id, index, p.at + step);
		} else return;
		e.preventDefault();
		e.stopPropagation();
	}
	// ── Gain envelope points (docs/multitrack-recorder.md "Clip gain envelopes") ──
	interface PointDrag {
		clip: StudioClip;
		index: number;
		pointerId: number;
		startX: number;
		startY: number;
		/** The clip's height on screen, so a vertical move maps onto the factor's range. */
		height: number;
		/** The point as it is dragged (the preview). */
		t: number;
		v: number;
		moved: boolean;
	}
	let pointDrag = $state<PointDrag | null>(null);
	/** Whether the clip wears its envelope: the mode is on, the clip is the selected audio clip and nothing else is being dragged. */
	const wearsEnvelope = (clip: StudioClip) =>
		envelope && selected === clip.id && !!clip.sourceId && !drag;
	/** The clip's points with the dragged one where the pointer has it. */
	function envelopePoints(clip: StudioClip): StudioGainPoint[] {
		const points = clip.gainEnvelope ?? [];
		if (pointDrag?.clip.id !== clip.id) return points;
		const d = pointDrag;
		return points.map((p, i) => (i === d.index ? { t: d.t, v: d.v } : p));
	}
	/** Content second → the clip's x in pixels; factor → y in hundredths of its height (double at the top, silence at the foot). */
	const pointX = (clip: StudioClip, t: number) => (t - clip.offset) * pxPerSecond;
	const pointY = (v: number) => (1 - v / GAIN_ENVELOPE_MAX) * 100;
	/** The line across the clip: flat at one without points, held beyond the first and last. */
	function envelopeLine(clip: StudioClip): string {
		const points = envelopePoints(clip);
		const width = Math.max(6, clip.duration * pxPerSecond);
		const span = [clip.offset, clip.offset + clip.duration];
		const ys = [
			`0,${pointY(gainEnvelopeAt(points, span[0]!))}`,
			...points
				.filter((p) => p.t > span[0]! && p.t < span[1]!)
				.map((p) => `${pointX(clip, p.t)},${pointY(p.v)}`),
			`${width},${pointY(gainEnvelopeAt(points, span[1]!))}`,
		];
		return ys.join(" ");
	}
	const dbText = (v: number) => (v <= 0.0005 ? "silence" : `${(20 * Math.log10(v)).toFixed(1)} dB`);
	function onpointdown(e: PointerEvent, clip: StudioClip, index: number) {
		if (e.button !== 0) return;
		e.stopPropagation();
		e.preventDefault();
		const points = clip.gainEnvelope ?? [];
		if (e.altKey) {
			engine.setClipGainEnvelope(
				clip.id,
				points.filter((_, i) => i !== index),
			);
			return;
		}
		const el = e.currentTarget as HTMLElement;
		el.focus({ preventScroll: true });
		el.setPointerCapture(e.pointerId);
		const height = (el.parentElement as HTMLElement).getBoundingClientRect().height || LANE_H;
		pointDrag = {
			clip,
			index,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			height,
			t: points[index]!.t,
			v: points[index]!.v,
			moved: false,
		};
	}
	function onpointmove(e: PointerEvent) {
		if (!pointDrag || e.pointerId !== pointDrag.pointerId) return;
		const d = pointDrag;
		const dx = e.clientX - d.startX;
		const dy = e.clientY - d.startY;
		if (!d.moved && Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
		d.moved = true;
		const p = d.clip.gainEnvelope![d.index]!;
		// Sideways follows the grid unless Shift is held, as a clip does; up and down run over the factor's range across the clip's height.
		const raw = p.t + dx / pxPerSecond;
		const timeline = d.clip.start + raw - d.clip.offset;
		const snapped = e.shiftKey ? timeline : engine.snap(timeline);
		d.t = Math.max(0, snapped - d.clip.start + d.clip.offset);
		d.v = Math.max(0, Math.min(GAIN_ENVELOPE_MAX, p.v - (dy / d.height) * GAIN_ENVELOPE_MAX));
	}
	function onpointup(e: PointerEvent) {
		if (!pointDrag || e.pointerId !== pointDrag.pointerId) return;
		const d = pointDrag;
		pointDrag = null;
		if (!d.moved) return;
		const points = (d.clip.gainEnvelope ?? []).filter((_, i) => i !== d.index);
		engine.setClipGainEnvelope(d.clip.id, gainEnvelopeWith(points, { t: d.t, v: d.v }));
	}
	/** The points after a key on point `index`: Delete takes it out, the arrows nudge it; null for any other key. */
	function pointAfterKey(e: KeyboardEvent, p: StudioGainPoint, others: StudioGainPoint[]) {
		if (e.key === "Delete" || e.key === "Backspace") return others;
		// A twentieth of the range up or down (a fifth with Shift); a hundredth of a second sideways (a tenth with Shift).
		const dv = e.key === "ArrowUp" ? 1 : e.key === "ArrowDown" ? -1 : 0;
		const dt = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
		if (!dv && !dt) return null;
		const t = p.t + dt * (e.shiftKey ? 0.1 : 0.01);
		const v = p.v + dv * (e.shiftKey ? 0.2 : 0.05);
		return gainEnvelopeWith(others, { t, v });
	}
	function onpointkey(e: KeyboardEvent, clip: StudioClip, index: number) {
		const points = clip.gainEnvelope ?? [];
		const p = points[index];
		if (!p) return;
		const next = pointAfterKey(
			e,
			p,
			points.filter((_, i) => i !== index),
		);
		if (!next) return;
		engine.setClipGainEnvelope(clip.id, next);
		e.preventDefault();
		e.stopPropagation();
	}
	function onkeydown(e: KeyboardEvent) {
		if (isTextEntry(e.target)) return;
		const chosen = selectedIds.length ? selectedIds : selected ? [selected] : [];
		if ((e.key === "Delete" || e.key === "Backspace") && chosen.length) {
			// Shift closes the gap the clips leave (a ripple delete).
			engine.deleteClips(chosen, e.shiftKey);
			clearSelection();
			e.preventDefault();
		} else if (range && (e.key === "Delete" || e.key === "Backspace")) {
			// The ruler's range with no clip selected: Delete cuts it from every track, Shift+Delete closes the gap too.
			engine.deleteRange(range.start, range.end, e.shiftKey);
			if (e.shiftKey) range = null;
			e.preventDefault();
		} else if (
			range &&
			(e.key === "Insert" || (e.shiftKey && (e.key === "I" || e.key === "i"))) &&
			!(e.metaKey || e.ctrlKey || e.altKey)
		) {
			// Insert (or Shift+I) pushes everything from the range's start later by its length; the range stays, over the silence.
			engine.insertRange(range.start, range.end - range.start);
			e.preventDefault();
		} else if (e.key === "Escape") {
			clearSelection();
			range = null;
		} else if ((e.key === "," || e.key === ".") && !(e.metaKey || e.ctrlKey || e.altKey)) {
			// Jump to the previous (,) or next (.) marker.
			const m = engine.markerFrom(engine.position, e.key === "." ? 1 : -1);
			if (m) engine.seek(m.t);
			e.preventDefault();
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

	// ── Waveforms: each clip draws the visible window of its span ──────────
	/**
	 * A clip's canvas covers the part of the clip in view (plus a margin on
	 * either side), not the whole clip: a 2:27 stem on a Retina screen is
	 * 11,500 backing pixels at the default zoom and 39,000 zoomed in, past
	 * what the GPU composites, so a whole-clip canvas came up blank (Kevin,
	 * 2026-10-20), and a capped one blurry. The canvas sits inside the clip's
	 * box at the window's offset, moves with the scroll, and draws at the
	 * screen's own resolution. `baseLeft` and `fullWidth` are the clip's
	 * place and width in the box (a trim under way keeps them, the box's
	 * overflow masking); the attachment re-runs when they change (a zoom,
	 * a trim).
	 */
	const WINDOW_MARGIN_PX = 320;
	function clipWave(
		clip: StudioClip,
		baseLeft: number,
		fullWidth: number,
	): Attachment<HTMLCanvasElement> {
		return (canvas) => {
			let key = "";
			let frame = 0;
			const draw = () => {
				frame = 0;
				const h = canvas.clientHeight;
				if (!h || !clip.sourceId) return;
				const box = canvas.parentElement;
				const sc = scroller;
				// The window: the scroller's view, widened by the margin, clipped to the clip; the whole clip without a scroller.
				let vx = 0;
				let vw = fullWidth;
				if (sc && box) {
					const clipLeft =
						box.getBoundingClientRect().left -
						sc.getBoundingClientRect().left +
						sc.scrollLeft +
						baseLeft;
					vx = Math.max(0, Math.min(fullWidth, sc.scrollLeft - WINDOW_MARGIN_PX - clipLeft));
					const vEnd = Math.max(
						0,
						Math.min(fullWidth, sc.scrollLeft + sc.clientWidth + WINDOW_MARGIN_PX - clipLeft),
					);
					vw = Math.max(0, vEnd - vx);
				}
				canvas.style.left = `${baseLeft + vx}px`;
				canvas.style.width = `${vw}px`;
				if (vw < 1) return;
				// A warped clip draws the rendering of its warp once it is in (docs/multitrack-recorder.md "Warping a clip"); until then its peaks, read through the warp.
				const buffer = engine.clipBufferOf(clip);
				const source = engine.sources[clip.sourceId];
				const dpr = devicePixelRatio || 1;
				const next = `${clip.sourceId}:${clip.offset}:${clip.duration}:${clip.loop?.start}:${clip.loop?.end}:${clip.warp ? warpKey(clip.warp) : ""}:${vx}:${vw}:${h}:${dpr}:${buffer ? "b" : "p"}:${getComputedStyle(canvas).color}`;
				if (next === key) return;
				key = next;
				const bw = Math.max(1, Math.round(vw * dpr));
				const bh = Math.max(1, Math.round(h * dpr));
				canvas.width = bw;
				canvas.height = bh;
				const g = canvas.getContext("2d");
				if (!g) return;
				g.clearRect(0, 0, bw, bh);
				g.fillStyle = getComputedStyle(canvas).color;
				const mid = bh / 2;
				// The window's span of the clip, in seconds from the clip's start; each pixel reads the source where the clip's pass has it (utils/clipSegments.ts).
				const c0 = (vx / fullWidth) * clip.duration;
				const span = (vw / fullWidth) * clip.duration;
				const segs = clipSegments(clip);
				let si = 0;
				const sourceAt = (t: number) => {
					while (si < segs.length - 1 && t >= segs[si + 1]!.start - clip.start) si++;
					const seg = segs[si]!;
					return {
						at: seg.offset + (t - (seg.start - clip.start)),
						end: seg.offset + seg.duration,
					};
				};
				if (buffer) {
					const sr = buffer.sampleRate;
					const per = Math.max(1, Math.floor(span * sr)) / bw;
					const chans = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
						buffer.getChannelData(c),
					);
					// At most 64 samples looked at per pixel: enough for a peak, cheap when zoomed out.
					const step = Math.max(1, Math.floor(per / 64));
					for (let x = 0; x < bw; x++) {
						const src = sourceAt(c0 + (x / bw) * span);
						const a = Math.floor(src.at * sr);
						const b = Math.min(buffer.length, Math.floor(src.end * sr), a + Math.floor(per));
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
					for (let x = 0; x < bw; x++) {
						const content = sourceAt(c0 + (x / bw) * span).at;
						const t = clip.warp ? warpSourceAt(clip.warp, content) : content;
						const p = peaks[Math.min(n - 1, Math.floor((t / total) * n))] ?? 0;
						const amp = p * (mid - 1);
						g.fillRect(x, mid - amp, 1, Math.max(1, amp * 2));
					}
				}
				// Where a looped clip's passes meet: a faint line.
				g.globalAlpha = 0.45;
				for (const seg of segs.slice(1)) {
					const x = Math.round(((seg.start - clip.start - c0) / span) * bw);
					if (x > 0 && x < bw) g.fillRect(x, 0, 1, bh);
				}
				g.globalAlpha = 1;
			};
			const schedule = () => {
				if (!frame) frame = requestAnimationFrame(draw);
			};
			draw();
			// The window follows the scroll and the view's width; the lane's height too.
			const sc = scroller;
			sc?.addEventListener("scroll", schedule, { passive: true });
			const ro = new ResizeObserver(schedule);
			if (sc) ro.observe(sc);
			if (canvas.parentElement) ro.observe(canvas.parentElement);
			// A source that decodes after the clip mounted redraws it; so does a change of the track's tint (the canvas's color).
			$effect(() => {
				void (clip.sourceId && engine.sources[clip.sourceId]?.status);
				void engine.decoding;
				void engine.warping;
				void engine.arrangement.tracks.find((t) => t.id === clip.trackId)?.colour;
				schedule();
			});
			return () => {
				sc?.removeEventListener("scroll", schedule);
				ro.disconnect();
				if (frame) cancelAnimationFrame(frame);
			};
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
				const next = `${clip.id}:${clip.offset}:${clip.duration}:${clip.loop?.start}:${clip.loop?.end}:${w}:${h}:${notes.length}:${notes.map((n) => n.t + n.p).join(",").length}`;
				if (next === key) return;
				key = next;
				const dpr = devicePixelRatio || 1;
				canvas.width = Math.round(w * dpr);
				canvas.height = Math.round(h * dpr);
				const g = canvas.getContext("2d");
				if (!g) return;
				g.scale(dpr, dpr);
				g.clearRect(0, 0, w, h);
				const color = getComputedStyle(canvas).color;
				if (clip.loop) {
					// A looped clip: the notes as they play, pass after pass (utils/clipNoteEvents.ts), from the clip's start; a faint line where the passes meet.
					const played = clipNoteEvents({ ...clip, gain: 1 }).map((e) => ({
						t: e.at - clip.start,
						d: e.duration,
						p: e.pitch,
						v: e.velocity,
					}));
					drawRoll(g, played, { w, h, origin: 0, seconds: clip.duration }, color);
					g.fillStyle = color;
					g.globalAlpha = 0.45;
					for (const seg of clipSegments(clip).slice(1))
						g.fillRect(Math.round(((seg.start - clip.start) / clip.duration) * w), 0, 1, h);
					g.globalAlpha = 1;
				} else
					drawRoll(
						g,
						notes.filter((n) => n.t + n.d > clip.offset && n.t < clip.offset + clip.duration),
						{ w, h, origin: clip.offset, seconds: clip.duration },
						color,
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

	/** A warped clip's badge: its one stretch as "×1.14", or "warped" when its segments differ. */
	function warpText(clip: StudioClip): string {
		const ratio = clip.warp ? warpUniformRatio(clip.warp) : null;
		return ratio === null ? "warped" : `×${ratio.toFixed(2)}`;
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
	style:max-height="min(70vh, {rows.reduce((h, r) => h + rowHeightOf(r), 0) + 140}px)"
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
				? `${engine.arrangement.bpm} bpm · ${engine.arrangement.beatsPerBar}/${engine.arrangement.beatUnit ?? 4}`
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
			{#if range}
				<div
					class="pointer-events-none absolute inset-y-0 z-5 truncate border-x border-white/60 bg-white/15 px-1 text-10px leading-7 text-light"
					style:left="{range.start * pxPerSecond}px"
					style:width="{Math.max(1, (range.end - range.start) * pxPerSecond)}px"
					data-range-ruler
				>
					{formatTime(range.start)} – {formatTime(range.end)}
				</div>
			{/if}
			<!-- Tempo and meter changes (D5): a flag each at the top; double-click edits, Delete on a focused one removes it. -->
			<!-- Keyed by time and place: two changes on one time (a jump an import wrote as two points) must not crash the ruler. -->
			{#each engine.tempoChanges as c, i (`${c.start}#${i}`)}
				<button
					type="button"
					class="absolute top-0 z-10 h-3.5 rounded-b px-1 text-9px leading-3.5 bg-blue-300/80 text-dark hover:bg-blue-200 focus-visible:ring-1 focus-visible:ring-white"
					style:left="{c.start * pxPerSecond}px"
					data-tempo-change={c.start}
					aria-label="Tempo {c.ramp ? 'ramp' : 'change'} to {c.bpm} bpm at {formatTime(c.start)}"
					title="{c.bpm} bpm {c.ramp
						? `reached at ${formatTime(c.start)}, ramping from the tempo before`
						: `from ${formatTime(c.start)}`} (double-click to edit, R {c.ramp
						? 'makes it a step'
						: 'makes it a ramp'}, Delete to remove)"
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
						} else if (e.key === "r" || e.key === "R") {
							engine.setTempoRamp(c.start, c.ramp ? null : "beats");
							e.preventDefault();
							e.stopPropagation();
						}
					}}>{c.ramp ? "⟋" : ""}{c.bpm}</button
				>
			{/each}
			{#each engine.meterChanges as c, i (`${c.start}#${i}`)}
				<button
					type="button"
					class="absolute top-0 z-10 h-3.5 rounded-b px-1 text-9px leading-3.5 bg-green-300/80 text-dark hover:bg-green-200 focus-visible:ring-1 focus-visible:ring-white"
					style:left="{c.start * pxPerSecond + 22}px"
					data-meter-change={c.start}
					aria-label="Meter change to {c.beatsPerBar}/{c.beatUnit ?? 4} at {formatTime(c.start)}"
					title="{c.beatsPerBar}/{c.beatUnit ?? 4} from {formatTime(
						c.start,
					)} (double-click to edit, Delete to remove)"
					onpointerdown={(e) => e.stopPropagation()}
					onclick={() => engine.seek(c.start)}
					ondblclick={() => {
						// "6/8", or the beats alone over the note it has.
						const text = prompt(
							"Meter from here (6/8, or beats a bar)",
							`${c.beatsPerBar}/${c.beatUnit ?? 4}`,
						);
						const [n, d] = (text ?? "").split("/").map((x) => Number(x.trim()));
						if (n) engine.setMeterChange(c.start, n, d || (c.beatUnit ?? 4));
					}}
					onkeydown={(e) => {
						if (e.key === "Delete" || e.key === "Backspace") {
							engine.removeMeterChange(c.start);
							e.preventDefault();
							e.stopPropagation();
						}
					}}>{c.beatsPerBar}/{c.beatUnit ?? 4}</button
				>
			{/each}
			<!-- Key changes: a flag each (violet); double-click edits, Delete on a focused one removes it. -->
			{#each engine.keyChanges as c, i (`${c.start}#${i}`)}
				<button
					type="button"
					class="absolute top-0 z-10 h-3.5 rounded-b px-1 text-9px leading-3.5 bg-violet-300/80 text-dark hover:bg-violet-200 focus-visible:ring-1 focus-visible:ring-white"
					style:left="{c.start * pxPerSecond + 44}px"
					data-key-change={c.start}
					aria-label="Key change to {c.key} at {formatTime(c.start)}"
					title="{c.key} from {formatTime(c.start)} (double-click to edit, Delete to remove)"
					onpointerdown={(e) => e.stopPropagation()}
					onclick={() => engine.seek(c.start)}
					ondblclick={() => {
						const v = prompt("Key from here", c.key);
						if (v !== null) engine.setKeyChange(c.start, v);
					}}
					onkeydown={(e) => {
						if (e.key === "Delete" || e.key === "Backspace") {
							engine.removeKeyChange(c.start);
							e.preventDefault();
							e.stopPropagation();
						}
					}}>{c.key}</button
				>
			{/each}
			<!-- Sections (D4): a band from each section marker to the next (or the song's end); the flag carries the name for assistive tech. -->
			{#each engine.sections as sec (sec.id)}
				<div
					class="pointer-events-none absolute top-0 h-3 truncate border-l border-sky-300/60 bg-sky-400/25 px-1 text-9px leading-3 text-sky-100"
					style:left="{sec.start * pxPerSecond}px"
					style:width="{Math.max(0, sec.end - sec.start) * pxPerSecond}px"
					data-section={sec.id}
					aria-hidden="true"
				>
					{sec.name}
				</div>
			{/each}
			<!-- Comments (D7): a dot each at the ruler's foot; a click seeks there and opens the thread. -->
			{#each comments as c (c.id)}
				<button
					type="button"
					class="absolute bottom-0 z-10 h-2 w-2 -translate-x-1/2 rounded-full bg-rose-300 hover:bg-rose-200 focus-visible:ring-1 focus-visible:ring-white"
					style:left="{c.at * pxPerSecond}px"
					data-comment-marker={c.id}
					aria-label="Comment by {c.by} at {formatTime(c.at)}"
					title="{c.by} at {formatTime(c.at)}"
					onpointerdown={(e) => e.stopPropagation()}
					onclick={() => {
						engine.seek(c.at);
						oncomment?.(c.id);
					}}
				></button>
			{/each}
			<!-- Markers (D4): a flag each; click jumps there, double-click renames, S makes it a section, Delete on a focused one removes it. -->
			{#each engine.markers as m (m.id)}
				<button
					type="button"
					class="absolute bottom-0 z-10 h-4 max-w-32 truncate rounded-t px-1 text-10px leading-4 text-dark focus-visible:ring-1 focus-visible:ring-white {m.section
						? 'bg-sky-300/90 hover:bg-sky-200'
						: 'bg-maximumYellow/80 hover:bg-maximumYellow'}"
					style:left="{m.t * pxPerSecond}px"
					data-marker={m.id}
					aria-label="{m.section ? 'Section' : 'Marker'} {m.name} at {formatTime(m.t)}"
					title="{m.name} · {formatTime(m.t)} (double-click to rename, S {m.section
						? 'makes it a plain marker'
						: 'makes it a section'}, Delete to remove; , and . jump between markers)"
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
						} else if ((e.key === "s" || e.key === "S") && !(e.metaKey || e.ctrlKey || e.altKey)) {
							// Not the page's S (split the selected clip).
							engine.toggleMarkerSection(m.id);
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

	{#each rows as row (row.kind === "group" ? `group:${row.bus.id}` : row.track.id)}
		{#if row.kind === "group"}
			<!-- A group's row (docs/multitrack-recorder.md "Folder tracks"): the folder bus's header and a sketch of the clips under it. -->
			<StudioGroupRow
				bus={row.bus}
				depth={row.depth}
				collapsed={row.collapsed}
				clips={groupClipsOf(row.bus.id)}
				{laneWidth}
				{pxPerSecond}
				headerWidth={HEADER_W}
				height={GROUP_H}
			/>
		{:else}
			{@const track = row.track}
			{@const index = engine.arrangement.tracks.indexOf(track)}
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
					style:padding-left={row.depth ? `${8 + row.depth * 12}px` : undefined}
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
						{#if track.frozen}
							<span
								class="i-ph-snowflake text-13px text-blue-200"
								role="img"
								aria-label="{track.name} is frozen"
								title="Frozen: one rendering stands in for the clips and inserts (Unfreeze in the menu)"
							></span>
						{/if}
						<!-- The automation lane under the clips (docs/dawn-daw-plan.md, D1): a MIDI track has no audio path to automate. -->
						{#if !isMidi(track)}
							<button
								type="button"
								class="device-fader-button-sm {laneShown[track.id] ? 'text-accent' : ''}"
								aria-pressed={!!laneShown[track.id]}
								aria-label="Automation for {track.name}"
								title="Automation: a lane of points under the clips for the volume, the pan, the mute, a send or an insert"
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
						<StudioTrackMenu {track} {index} {onrender} {onfreeze} {onunfreeze} />
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
								disabled={!!track.frozen}
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
							options={engine
								.lanesOf(track.id)
								.map((l) => ({ value: l.key, label: l.range.label }))}
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
									: dragging && (drag!.mode === "right" || drag!.mode === "stretch") && drag!.moved
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
									: ''} {dim ? 'opacity-50' : ''} {clip.muted ? 'opacity-35 saturate-50' : ''}"
								style:left="{shown.start * pxPerSecond}px"
								style:width="{Math.max(6, shown.duration * pxPerSecond)}px"
								style:transform={dragging && drag!.mode === "move"
									? `translate(${drag!.dt * pxPerSecond}px, ${rowsToPx(rowIndexOf(track.id), drag!.rows)}px)`
									: undefined}
								data-clip={clip.id}
								data-selected={selectedIds.includes(clip.id) || undefined}
								data-muted={clip.muted || undefined}
								data-warp={clip.warp ? warpText(clip) : undefined}
								data-anchor={clip.anchor}
								role="button"
								tabindex="0"
								aria-label="{clip.name || 'Clip'} at {formatTime(clip.start)}{clip.notes
									? ` (${clip.notes.length} ${clip.notes.length === 1 ? 'note' : 'notes'})`
									: ''}"
								title="{clip.name} · {formatTime(clip.start)} – {formatTime(
									clip.start + clip.duration,
								)}{clip.warp ? ` · stretched ${warpText(clip)}` : ''}{clip.anchor === 'beats'
									? ' · follows the tempo'
									: ''}"
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
									<!-- Placed and sized by the attachment: the window of the clip in view, at the screen's resolution. -->
									<canvas
										class="absolute top-0 bottom-0 h-full text-blue-200 {source?.status === 'ready'
											? 'opacity-90'
											: 'opacity-30'}"
										style:color={tint ?? undefined}
										{@attach clipWave(
											clip,
											(clip.start - shown.start) * pxPerSecond,
											Math.max(6, clip.duration * pxPerSecond),
										)}
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
								<!-- the warp markers of the selected clip: a line with a flag, dragged onto the grid; Alt-click or Delete removes one -->
								{#if selected === clip.id && clip.warp && !dragging}
									{#each warpMarkersOf(clip) as m (m.index)}
										<button
											type="button"
											class="absolute top-0 bottom-0 w-9px -ml-1 p-0 border-0 bg-transparent cursor-col-resize outline-none focus-visible:ring-1 focus-visible:ring-amber-300 touch-none"
											style:left="{(markerAt(clip, m) - clip.offset) * pxPerSecond}px"
											data-warp-marker={m.index}
											aria-label="Warp marker at {formatTime(
												clip.start + markerAt(clip, m) - clip.offset,
											)}"
											title="Warp marker: drag the audio here onto the grid (Shift for free); Delete or Alt-click removes it"
											onpointerdown={(e) => onmarkerdown(e, clip, m.index)}
											onpointermove={onmarkermove}
											onpointerup={onmarkerup}
											onpointercancel={onmarkerup}
											onkeydown={(e) => onmarkerkey(e, clip, m.index)}
											ondblclick={(e) => e.stopPropagation()}
										>
											<span
												class="absolute inset-y-0 left-1 w-px bg-amber-300/80"
												aria-hidden="true"
											></span>
											<span
												class="absolute top-0 left-0 w-9px h-6px bg-amber-300 [clip-path:polygon(0_0,100%_0,50%_100%)]"
												aria-hidden="true"
											></span>
										</button>
									{/each}
								{/if}
								<!-- the gain line of the selected clip (docs/multitrack-recorder.md "Clip gain envelopes"): a press on the clip adds a point; points drag, Alt-click or Delete removes one -->
								{#if wearsEnvelope(clip)}
									<svg
										class="absolute inset-0 w-full h-full pointer-events-none overflow-visible"
										viewBox="0 0 {Math.max(6, clip.duration * pxPerSecond)} 100"
										preserveAspectRatio="none"
										aria-hidden="true"
										data-gain-line
									>
										<polyline
											points={envelopeLine(clip)}
											fill="none"
											stroke="rgb(253 224 71)"
											stroke-width="1.5"
											vector-effect="non-scaling-stroke"
										/>
									</svg>
									{#each envelopePoints(clip) as p, index (index)}
										<button
											type="button"
											class="absolute w-11px h-11px -ml-1.5 -mt-1.5 p-0 rounded-full border border-black/60 bg-yellow-300 cursor-move outline-none focus-visible:ring-1 focus-visible:ring-white touch-none"
											style:left="{pointX(clip, p.t)}px"
											style:top="{pointY(p.v)}%"
											data-gain-point={index}
											aria-label="Gain point at {formatTime(
												clip.start + p.t - clip.offset,
											)}, {dbText(p.v)}"
											title="Gain point: drag to move it (Shift for free timing), arrows nudge, Delete or Alt-click removes it"
											onpointerdown={(e) => onpointdown(e, clip, index)}
											onpointermove={onpointmove}
											onpointerup={onpointup}
											onpointercancel={onpointup}
											onkeydown={(e) => onpointkey(e, clip, index)}
											ondblclick={(e) => e.stopPropagation()}
										></button>
									{/each}
								{/if}
								<span
									class="absolute left-1 top-0.5 text-10px leading-none truncate max-w-[calc(100%-8px)] px-1 rounded bg-black/40"
								>
									{clip.name}{clip.loop ? " ↻" : ""}{clip.warp
										? ` ${warpText(clip)}`
										: ""}{clip.muted ? " · off" : ""}{takes > 1
										? ` · ${takes} takes`
										: ""}{source?.pending
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
									<!-- The lane's box is the clip's width; the attachment keeps the canvas to the window in view. -->
									<canvas
										class="absolute top-0 bottom-0 h-full text-blue-200/70"
										style:color={tint ?? undefined}
										{@attach clipWave(
											{ ...comp, id: `${comp.id}:${sourceId}`, sourceId },
											0,
											Math.max(6, comp.duration * pxPerSecond),
										)}
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
		{/if}
	{/each}
	{#if engine.arrangement.tracks.length === 0}
		<div class="px-4 py-10 text-center text-dim text-14px" style:width="{HEADER_W + laneWidth}px">
			No tracks yet. Add one and arm it to record.
		</div>
	{/if}
	<!-- The buses and the master: a thin row each, an A button opening a lane of their own (volume, mute, inserts; a bus's pan too). -->
	{#each mixRows as row (row.id)}
		<div
			class="flex"
			style:width="{HEADER_W + laneWidth}px"
			style:height="{MIX_H + (laneShown[row.id] ? AUTO_H : 0)}px"
			data-mix-row={row.id}
		>
			<div
				class="sticky left-0 z-10 shrink-0 grid content-start gap-1 overflow-hidden border-r border-b border-white/10 border-l-2 border-l-transparent bg-oxford-900 px-2 py-1"
				style:width="{HEADER_W}px"
			>
				<div class="flex items-center gap-1.5 min-w-0">
					<span
						class="min-w-0 grow truncate px-1 text-12px font-500 {row.kind === 'master'
							? 'text-maximumYellow'
							: 'text-blue-300'}">{row.name}</span
					>
					<button
						type="button"
						class="device-fader-button-sm {laneShown[row.id] ? 'text-accent' : ''}"
						aria-pressed={!!laneShown[row.id]}
						aria-label="Automation for {row.name}"
						title="Automation: a lane of points for the {row.kind === 'master'
							? 'master'
							: 'bus'}'s volume, mute or inserts"
						onclick={() => toggleLane(row.id)}>A</button
					>
				</div>
				{#if laneShown[row.id]}
					<ComboBox
						ariaLabel="{row.name} automation parameter"
						options={engine.lanesOf(row.id).map((l) => ({ value: l.key, label: l.range.label }))}
						value={laneOf(row.id)?.key ?? "volume"}
						onchange={(v) => (laneShown = { ...laneShown, [row.id]: v })}
						clearDefaultButtonClasses
						buttonClasses="flex w-full items-center gap-1 h-6 px-1.5 rounded border border-accent/40 bg-oxford-800 text-11px text-accent"
						popoverClasses="text-11px"
					/>
				{/if}
			</div>
			<div class="grid grid-rows-[1fr_auto] border-b border-white/10" style:width="{laneWidth}px">
				<div></div>
				{#if laneShown[row.id] && laneOf(row.id)}
					{@const choice = laneOf(row.id)!}
					{@const param = choice.key}
					<div class="relative bg-black/20" style:height="{AUTO_H}px" data-automation-for={row.id}>
						<AutomationLane
							points={(row.kind === "master"
								? engine.arrangement.masterAutomation
								: engine.arrangement.buses?.find((b) => b.id === row.id)?.automation)?.[param] ??
								[]}
							range={choice.range}
							{pxPerSecond}
							width={laneWidth}
							height={AUTO_H}
							snap={engine.arrangement.gridOn ? (t) => engine.snap(t) : undefined}
							playhead={engine.running ? engine.position : null}
							fallback={engine.automatedValue(row.id, param, 0)}
							label={choice.range.label}
							onchange={(points) => engine.setAutomation(row.id, param, points)}
						/>
					</div>
				{/if}
			</div>
		</div>
	{/each}

	<!-- The ruler's range over every lane, like the playhead: below the sticky headers and the ruler. -->
	{#if range}
		<div
			class="pointer-events-none absolute top-0 bottom-0 z-5 border-x border-white/50 bg-white/10"
			data-range
			style:left="{HEADER_W + range.start * pxPerSecond}px"
			style:width="{Math.max(1, (range.end - range.start) * pxPerSecond)}px"
		></div>
	{/if}
	<!-- The playhead over every lane: below the sticky headers (z-10) and the ruler, so it hides behind them as the lanes scroll. -->
	<div
		class="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent z-5"
		data-playhead
		style:left="{HEADER_W + playheadX}px"
	></div>
</div>
