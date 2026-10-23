<script lang="ts">
	import type { MixerModel, MixerTrack } from "#lib/audio/mixerModel.js";
	import LevelMeter from "#lib/components/LevelMeter.svelte";
	import { stemTintHex } from "#lib/constants/stemTints.js";
	import { meterWidth } from "#lib/utils/meterLevel.js";
	import { panBalance } from "#lib/utils/panBalance.js";
	import { spreadPucks } from "#lib/utils/spreadPucks.js";
	import {
		gainAtY,
		nudgeGain,
		nudgePan,
		panAtX,
		xOfPan,
		yOfGain,
	} from "#lib/utils/stagePosition.js";
	import type { Snippet } from "svelte";

	/**
	 * The Stage (docs/visual-mixer.md): every track a puck on a field where
	 * left to right is pan and up is level, dragged to set both at once,
	 * over whichever engine the `model` wraps (the stem player's or Dawn's).
	 * The halos breathe with each track's RMS, the bar along the bottom
	 * shows where the mix leans, and the strip under the stage holds the
	 * selected track's mute, solo, menu and readouts.
	 */
	interface Props {
		model: MixerModel;
		/** The track's ⋯ menu, by id (the rows' snippet, wrapped by the player). */
		menu?: Snippet<[string]>;
		class?: string;
	}
	let { model, menu, class: cls = "" }: Props = $props();

	const BLUE = "#93C5FD";
	let stageEl = $state<HTMLElement | null>(null);
	let width = $state(0);
	let height = $state(0);
	let selected = $state<string | null>(null);
	/** The puck being dragged: where it started, so the gesture moves it by the pointer's travel. */
	let drag = $state<{
		id: string;
		pointerId: number;
		clientX: number;
		clientY: number;
		x0: number;
		y0: number;
		pan0: number;
		gain0: number;
		loudness: number;
		moved: boolean;
		/** With Shift held, the axis the gesture started along; the other stays put. */
		axis: "x" | "y" | null;
	} | null>(null);
	/** Which puck shows its readout (a drag under way, or a key just pressed). */
	let adjusting = $state<string | null>(null);
	let settle: ReturnType<typeof setTimeout> | null = null;

	/**
	 * What sits on the field: the tracks themselves (their own objects, so
	 * a handler reads the live level and pan), and a group (a folder bus,
	 * docs/multitrack-recorder.md "The Stage: group pucks and clusters")
	 * as a puck of its own; `kindOf` tells them apart by id.
	 */
	type Puck = MixerTrack & { collapsed?: boolean };
	const tracks = $derived(model.tracks);
	const groups = $derived(model.groups ?? []);
	const groupIds = $derived(new Set(groups.map((g) => g.id)));
	const kindOf = (p: MixerTrack): "track" | "group" => (groupIds.has(p.id) ? "group" : "track");
	/** The tracks under a folded group hide behind its puck. */
	const hidden = $derived(new Set(groups.filter((g) => g.collapsed).flatMap((g) => g.trackIds)));
	const pucks = $derived<Puck[]>([
		...tracks.filter((t) => !hidden.has(t.id)),
		...groups.map((g) => ({
			id: g.id,
			number: 0,
			label: g.label,
			tint: g.tint,
			gain: g.gain,
			pan: g.pan,
			muted: g.muted,
			soloed: false,
			mono: false,
			loudness: 0,
			collapsed: g.collapsed,
		})),
	]);
	const byId = $derived(new Map(pucks.map((p) => [p.id, p])));
	const selectedTrack = $derived(selected ? (byId.get(selected) ?? null) : null);
	/** Past about a dozen pucks the names hide when the stage is narrow, so pucks stay readable. */
	const dense = $derived(pucks.length > 12);
	/** A group's puck is never soloed out: soloing is a track's affair. */
	const silenced = (t: MixerTrack) =>
		t.muted || (kindOf(t) !== "group" && model.anySolo && !t.soloed);
	const colorOf = (t: MixerTrack) => stemTintHex(t.tint) ?? BLUE;
	/** A write to a puck's own side of the engine: a track's knobs, or the group's bus. */
	const setGain = (p: Puck, v: number) =>
		kindOf(p) === "group" ? model.setGroupGain?.(p.id, v) : model.setGain(p.id, v);
	const setPan = (p: Puck, v: number) =>
		kindOf(p) === "group" ? model.setGroupPan?.(p.id, v) : model.setPan(p.id, v);
	const toggleMute = (p: Puck) =>
		kindOf(p) === "group" ? model.toggleGroupMute?.(p.id) : model.toggleMute(p.id);
	const levelText = (v: number) => (v <= 0 ? "−∞ dB" : `${Math.round(20 * Math.log10(v))} dB`);
	const panText = (v: number) =>
		v === 0 ? "C" : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`;
	const describe = (t: Puck) =>
		`${kindOf(t) === "group" ? `Group ${t.label}` : `${t.number}, ${t.label}`}: ${levelText(t.gain)}, ${panText(t.pan)}${t.muted ? ", muted" : ""}${t.soloed ? ", solo" : ""}${t.collapsed ? ", folded" : ""}${t.mono && kindOf(t) === "track" ? ", mono" : ""}`;
	/** The unity line's height, for the dashed mark across the stage. */
	const unityY = yOfGain(1, 0);
	/** The field's top and bottom keep a margin, so a puck at the top (or the floor) stays whole and its readout fits. */
	const PAD_TOP = 0.1;
	const PAD_BOTTOM = 0.08;
	/** A level fraction (0 the floor, 1 the top) as the field's CSS top, in percent. */
	const topOf = (y: number) => (PAD_TOP + (1 - y) * (1 - PAD_TOP - PAD_BOTTOM)) * 100;
	/** Pucks on one spot spread into a ring (utils/spreadPucks.ts), in the field's pixels (a stand-in size before layout). */
	const spread = $derived(
		spreadPucks(
			pucks.map((p) => ({
				id: p.id,
				x: xOfPan(p.pan) * (width || 400),
				y: (topOf(yOfGain(p.gain, p.loudness)) / 100) * (height || 300),
			})),
		),
	);
	const spreadOf = (id: string) => spread.get(id) ?? { dx: 0, dy: 0, index: 0, count: 1 };

	/** Where the mix leans this frame: each track's RMS through its pan. */
	const balance = $derived(
		panBalance(
			tracks
				.filter((t) => !silenced(t))
				.map((t) => ({ level: model.levels[t.id]?.rms ?? 0, pan: t.pan, mono: t.mono })),
		),
	);

	function touched(id: string, sticky = false) {
		adjusting = id;
		if (settle) clearTimeout(settle);
		if (!sticky) settle = setTimeout(() => (adjusting = null), 700);
	}

	function down(e: PointerEvent, t: Puck) {
		if (e.button !== 0) return;
		e.preventDefault();
		(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
		selected = t.id;
		drag = {
			id: t.id,
			pointerId: e.pointerId,
			clientX: e.clientX,
			clientY: e.clientY,
			x0: xOfPan(t.pan),
			y0: yOfGain(t.gain, t.loudness),
			pan0: t.pan,
			gain0: t.gain,
			loudness: t.loudness,
			moved: false,
			axis: null,
		};
	}
	function move(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId || !stageEl) return;
		const rect = stageEl.getBoundingClientRect();
		const dx = e.clientX - drag.clientX;
		const dy = e.clientY - drag.clientY;
		if (!drag.moved && Math.hypot(dx, dy) < 3) return;
		drag.moved = true;
		if (e.shiftKey) {
			if (!drag.axis) drag.axis = Math.abs(dx) >= Math.abs(dy) ? "x" : "y";
		} else drag.axis = null;
		const x = drag.x0 + dx / rect.width;
		const y = drag.y0 - dy / rect.height;
		const p = byId.get(drag.id);
		if (!p) return;
		if (drag.axis !== "y") setPan(p, panAtX(x));
		else setPan(p, drag.pan0);
		if (drag.axis !== "x") setGain(p, gainAtY(y, drag.loudness));
		else setGain(p, drag.gain0);
		touched(drag.id, true);
	}
	function up(e: PointerEvent) {
		if (!drag || e.pointerId !== drag.pointerId) return;
		drag = null;
		touched(
			e.currentTarget instanceof HTMLElement ? (e.currentTarget.dataset.stagePuck ?? "") : "",
		);
	}
	function dblclick(e: MouseEvent, t: Puck) {
		if (e.altKey) setGain(t, 1);
		else setPan(t, 0);
		touched(t.id);
	}
	function key(e: KeyboardEvent, t: Puck) {
		const big = e.shiftKey;
		switch (e.key) {
			case "ArrowLeft":
				setPan(t, nudgePan(t.pan, big ? -0.2 : -0.05));
				break;
			case "ArrowRight":
				setPan(t, nudgePan(t.pan, big ? 0.2 : 0.05));
				break;
			case "ArrowUp":
				setGain(t, nudgeGain(t.gain, big ? 3 : 1));
				break;
			case "ArrowDown":
				setGain(t, nudgeGain(t.gain, big ? -3 : -1));
				break;
			case "m":
				toggleMute(t);
				break;
			case "s":
				if (kindOf(t) === "track") model.toggleSolo(t.id);
				break;
			case "f":
				if (kindOf(t) === "group") model.toggleGroupCollapsed?.(t.id);
				break;
			case "Escape":
				selected = null;
				(e.currentTarget as HTMLElement).blur();
				return;
			default:
				return;
		}
		e.preventDefault();
		touched(t.id);
	}

	/**
	 * The halos: a soft disc behind each puck as wide and bright as the
	 * track's RMS this frame. An attachment, so it redraws whenever the
	 * levels, the positions or the size change, and stops with the meters.
	 */
	function halos(canvas: HTMLCanvasElement) {
		const dpr = typeof devicePixelRatio === "number" ? devicePixelRatio : 1;
		const w = Math.max(1, Math.round(width * dpr));
		const h = Math.max(1, Math.round(height * dpr));
		if (canvas.width !== w || canvas.height !== h) {
			canvas.width = w;
			canvas.height = h;
		}
		const ctx = canvas.getContext("2d");
		if (!ctx) return;
		ctx.clearRect(0, 0, w, h);
		for (const t of pucks) {
			const rms = model.levels[t.id]?.rms ?? 0;
			const loud = meterWidth(rms);
			if (loud <= 0 || silenced(t)) continue;
			const sp = spreadOf(t.id);
			const cx = xOfPan(t.pan) * w + sp.dx * dpr;
			const cy = (topOf(yOfGain(t.gain, t.loudness)) / 100) * h + sp.dy * dpr;
			const r = (22 + 70 * loud) * dpr;
			const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
			const color = colorOf(t);
			g.addColorStop(0, `${color}${alpha(0.35 * loud + 0.1)}`);
			g.addColorStop(1, `${color}00`);
			ctx.fillStyle = g;
			ctx.beginPath();
			ctx.arc(cx, cy, r, 0, Math.PI * 2);
			ctx.fill();
		}
	}
	const alpha = (a: number) =>
		Math.round(Math.max(0, Math.min(1, a)) * 255)
			.toString(16)
			.padStart(2, "0");
</script>

<div class="@container grid gap-2 {cls}" data-mixer-stage>
	<!-- The stage: pan across, level up; the halos on a canvas behind the pucks. -->
	<div
		class="relative w-full overflow-hidden rounded-md border border-white/10 bg-black/30 aspect-[4/3] @3xl-aspect-[2/1] min-h-64 select-none"
		role="group"
		aria-label="Stage: tracks by pan and level"
		bind:this={stageEl}
		bind:clientWidth={width}
		bind:clientHeight={height}
	>
		<canvas class="absolute inset-0 h-full w-full" aria-hidden="true" {@attach halos}></canvas>
		<!-- the axes -->
		<div class="pointer-events-none absolute inset-0 text-10px text-dim" aria-hidden="true">
			<div class="absolute inset-y-0 left-1/2 w-px bg-white/10"></div>
			<span class="absolute left-2 top-1">L</span>
			<span class="absolute left-1/2 top-1 -translate-x-1/2">C</span>
			<span class="absolute right-2 top-1">R</span>
			<div
				class="absolute inset-x-0 border-t border-dashed border-white/15"
				style:top="{topOf(unityY)}%"
			></div>
			<span class="absolute right-2 -translate-y-full pb-0.5" style:top="{topOf(unityY)}%"
				>0 dB</span
			>
			<div
				class="absolute inset-x-0 border-t border-dashed border-white/10"
				style:top="{topOf(0)}%"
			></div>
			<span class="absolute right-2 -translate-y-full pb-0.5" style:top="{topOf(0)}%">−48 dB</span>
		</div>
		{#each pucks as t (t.id)}
			{@const x = xOfPan(t.pan)}
			{@const y = yOfGain(t.gain, t.loudness)}
			{@const color = colorOf(t)}
			{@const dim = silenced(t)}
			{@const isSelected = selected === t.id}
			{@const sp = spreadOf(t.id)}
			<!-- A group's puck is a rounded square with a folder; pucks on one spot sit in a ring (margin offsets), the first keeping the label. -->
			<button
				type="button"
				class="absolute -translate-x-1/2 -translate-y-1/2 touch-none outline-none focus-visible:ring-2 focus-visible:ring-playhead {kindOf(
					t,
				) === 'group'
					? 'rounded-lg'
					: 'rounded-full'} {drag?.id === t.id ? 'cursor-grabbing' : 'cursor-grab'}"
				style:left="{x * 100}%"
				style:top="{topOf(y)}%"
				style:margin-left={sp.dx ? `${sp.dx}px` : undefined}
				style:margin-top={sp.dy ? `${sp.dy}px` : undefined}
				style:z-index={isSelected ? 200 : 100 - Math.round(y * 90)}
				aria-label={describe(t)}
				aria-pressed={isSelected}
				title={t.label}
				data-stage-puck={t.id}
				data-stage-kind={kindOf(t)}
				data-stage-cluster={sp.count > 1 ? sp.count : undefined}
				onpointerdown={(e) => down(e, t)}
				onpointermove={move}
				onpointerup={up}
				onpointercancel={up}
				ondblclick={(e) => dblclick(e, t)}
				onkeydown={(e) => key(e, t)}
				onfocus={() => (selected = t.id)}
			>
				<span
					class="grid h-10 w-10 place-items-center border-2 text-12px font-600 tabular-nums transition-opacity {kindOf(
						t,
					) === 'group'
						? 'rounded-lg'
						: 'rounded-full'} {t.muted ? 'border-dashed' : ''} {dim ? 'opacity-40' : ''} {t.soloed
						? 'ring-2 ring-white/80 ring-offset-1 ring-offset-black/40'
						: ''}"
					style:border-color={color}
					style:background-color="{color}{isSelected ? '55' : '30'}"
					style:color={dim ? undefined : color}
				>
					{#if kindOf(t) === "group"}
						<span
							class="{t.collapsed ? 'i-ph-folder-simple' : 'i-ph-folder-open'} text-16px"
							aria-hidden="true"
						></span>
					{:else}
						{t.number}
					{/if}
				</span>
				<!-- The name beside the puck (not under it, so stacked pucks keep their names apart), truncated; a ring's first puck names the ring and counts the rest. -->
				{#if sp.index === 0}
					<span
						class="pointer-events-none absolute left-full top-1/2 ml-1 max-w-28 -translate-y-1/2 truncate text-11px leading-tight {dense &&
						!isSelected
							? 'hidden @3xl-block'
							: ''} {dim ? 'opacity-50' : 'opacity-90'}"
						style:color={dim ? undefined : color}
					>
						{t.label}{sp.count > 1 ? ` +${sp.count - 1}` : ""}
					</span>
				{/if}
				{#if adjusting === t.id}
					<span
						class="pointer-events-none absolute -top-6 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded border border-white/15 bg-dark px-1 text-10px leading-4 tabular-nums text-light shadow"
						data-stage-readout
					>
						{levelText(t.gain)} · {panText(t.pan)}
					</span>
				{/if}
			</button>
		{/each}
	</div>

	<!-- Where the mix leans, and the master after its fader. -->
	<div
		class="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,12rem)] items-center gap-2 text-11px"
	>
		<span class="text-dim">L</span>
		<div
			class="relative h-1.5 rounded bg-blue-100/10"
			role="meter"
			aria-label="Mix balance"
			aria-valuemin={-100}
			aria-valuemax={100}
			aria-valuenow={Math.round(balance.balance * 100)}
			aria-valuetext={balance.balance === 0
				? "centered"
				: balance.balance < 0
					? `left ${Math.round(-balance.balance * 100)}`
					: `right ${Math.round(balance.balance * 100)}`}
		>
			<div class="absolute inset-y-0 left-1/2 w-px bg-white/25"></div>
			<div
				class="absolute top-1/2 h-3 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-sm bg-blue-300 transition-[left] duration-75"
				style:left="{((balance.balance + 1) / 2) * 100}%"
			></div>
		</div>
		<span class="text-dim">R</span>
		<LevelMeter state={model.masterLevel} label="Master" onreset={() => model.resetClips()} />
	</div>

	<!-- The selected track's strip: its number and name, mute, solo, the menu, the readouts. -->
	<div
		class="flex min-h-9 flex-wrap items-center gap-x-3 gap-y-1 rounded border border-white/10 px-2 py-1 text-13px"
		data-stage-strip
	>
		{#if selectedTrack}
			{@const t = selectedTrack}
			<span
				class="flex min-w-0 max-w-full items-center gap-1 font-500"
				style:color={silenced(t) ? undefined : colorOf(t)}
			>
				{#if kindOf(t) === "group"}
					<span class="i-ph-folder-simple shrink-0 text-14px" aria-hidden="true"></span>
				{:else}
					<span class="shrink-0">{t.number} -</span>
				{/if}
				<span class="min-w-0 truncate" title={t.label}>{t.label}</span>
			</span>
			<span class="flex items-center gap-1">
				<button
					type="button"
					class="device-fader-button-sm"
					aria-pressed={t.muted}
					aria-label="Mute {t.label}"
					onclick={() => toggleMute(t)}>M</button
				>
				{#if kindOf(t) === "group"}
					<!-- Fold (F): the group's tracks hide behind its puck, as the timeline folds them away. -->
					<button
						type="button"
						class="device-fader-button-sm"
						aria-pressed={t.collapsed}
						aria-label="{t.collapsed ? 'Unfold' : 'Fold'} {t.label}"
						title="Fold the group's tracks behind its puck (F)"
						onclick={() => model.toggleGroupCollapsed?.(t.id)}
					>
						<span
							class="{t.collapsed ? 'i-ph-caret-right' : 'i-ph-caret-down'} text-13px"
							aria-hidden="true"
						></span>
					</button>
				{:else}
					<button
						type="button"
						class="device-fader-button-sm"
						aria-pressed={t.soloed}
						aria-label="Solo {t.label}"
						onclick={() => model.toggleSolo(t.id)}>S</button
					>
					{#if menu}{@render menu(t.id)}{/if}
				{/if}
			</span>
			<span class="tabular-nums text-dim">{levelText(t.gain)} · {panText(t.pan)}</span>
			{@render undoButtons()}
		{:else}
			<span class="text-dim"
				>Drag a track to set its level and pan; hold Shift to move along one axis. Height is how
				loud the track sounds.</span
			>
			{@render undoButtons()}
		{/if}
	</div>
</div>

<!-- Undo and redo for mix moves (⌘Z, ⌘⇧Z), when the engine keeps a history: one step per gesture. -->
{#snippet undoButtons()}
	{#if model.undo}
		<span class="ml-auto flex items-center gap-1">
			<button
				type="button"
				class="device-fader-button-sm"
				title="Undo the last mix move (⌘Z)"
				aria-label="Undo mix move"
				disabled={!model.undo.canUndo}
				onclick={() => model.undo?.undo()}
			>
				<span class="i-ph-arrow-counter-clockwise text-13px" aria-hidden="true"></span>
			</button>
			<button
				type="button"
				class="device-fader-button-sm"
				title="Redo (⌘⇧Z)"
				aria-label="Redo mix move"
				disabled={!model.undo.canRedo}
				onclick={() => model.undo?.redo()}
			>
				<span class="i-ph-arrow-clockwise text-13px" aria-hidden="true"></span>
			</button>
		</span>
	{/if}
{/snippet}
