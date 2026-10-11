<script lang="ts">
	import { amp } from "#lib/audio/amp.svelte.js";
	import { inputSources, type ChannelMode, type InputSource } from "#lib/audio/inputs.svelte.js";
	import AmpPedalsMenu from "#lib/components/AmpPedalsMenu.svelte";
	import AmpPresets, { type SavedAmpPreset } from "#lib/components/AmpPresets.svelte";
	import ComboBox from "#lib/components/ComboBox.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import IconDrumKit from "#lib/components/IconDrumKit.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import Knob from "#lib/components/Knob.svelte";
	import {
		AMP_CABINET_CAPTURES,
		AMP_INSTRUMENT_LABELS,
		AMP_MODEL_CABINET_LABEL,
		AMP_MODELS_FOR,
	} from "#lib/constants/amp.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { latencyVerdict } from "#lib/utils/latencyVerdict.js";
	import {
		AMP_INSTRUMENTS,
		AMP_MID_FREQUENCIES,
		type AmpInputMode,
		type AmpInstrument,
		type AmpModelId,
		type AmpSource,
	} from "#lib/val/AmpSchema.js";
	import type { NamedAmpPreset } from "#lib/val/AmpPresetSchema.js";
	import { onMount } from "svelte";

	/**
	 * The Practice Amp's face (docs/practice-amp.md): a toolbar (power,
	 * Guitar / Bass, the head, the Input and Pedals menus, the tuner and the
	 * metronome), a readout (the head, the meters, the latency and any
	 * warning) and the head's knobs and switches. The engine is the one
	 * `amp` (amp.svelte.ts); the tuner and metronome panels belong to the
	 * page, which this asks to open.
	 */
	interface Props {
		tunerOpen?: boolean;
		metronomeOpen?: boolean;
		ontuner?: () => void;
		onmetronome?: () => void;
		drumsOpen?: boolean;
		ondrums?: () => void;
		/** The chord player's panel on the page: the amp's demo input (docs/practice-amp.md, "Demo through the chord player"). */
		chordsOpen?: boolean;
		onchords?: () => void;
		/** The presets (docs/practice-amp.md, "Presets"): the site's six per instrument; without them the slot row does not show. */
		sitePresets?: Record<AmpInstrument, (NamedAmpPreset | null)[]> | null;
		/** A signed-in member's account: presets save to it and load from it. */
		account?: { id: string; name: string; canEdit: boolean } | null;
		presets?: SavedAmpPreset[];
		presetAdmin?: boolean;
		/** Read a `#amp=` share link on mount (off in a test). */
		readLink?: boolean;
	}
	let {
		tunerOpen = false,
		metronomeOpen = false,
		ontuner,
		onmetronome,
		drumsOpen = false,
		ondrums,
		chordsOpen = false,
		onchords,
		sitePresets = null,
		account = null,
		presets = [],
		presetAdmin = false,
		readLink = true,
	}: Props = $props();

	onMount(() => amp.load());
	const model = $derived(amp.model);
	const head = $derived(amp.rig.head);
	const headOptions = $derived(
		AMP_MODELS_FOR[amp.instrument].map((m) => ({ value: m.id, label: m.name })),
	);
	/** The cabinet menu (docs/practice-amp.md, "The cabinet"): the model's own, then the captured cabinets for the instrument; the menu shows only where captures exist. */
	const cabinetOptions = $derived([
		{ value: "model", label: AMP_MODEL_CABINET_LABEL[model.cabinet] },
		...AMP_CABINET_CAPTURES.filter((c) => c.instrument === amp.instrument).map((c) => ({
			value: c.id,
			label: c.name,
		})),
	]);
	/** The round trip as measured (Calibrate), else the browser's own figure for its output path doubled as a guess. */
	const verdict = $derived(
		latencyVerdict(
			amp.on
				? inputSources.latencyMeasured
					? inputSources.latencyMs
					: amp.outputLatencyMs > 0
						? amp.outputLatencyMs * 2
						: null
				: null,
			amp.bluetooth,
		),
	);
	/** The jack the inputs module is asked about: the line in stands in while the chord player is the source (no jack is open then). */
	const jack = $derived<InputSource>(amp.fromChords ? "line" : (amp.source as InputSource));
	async function power() {
		if (amp.on) {
			await amp.setOn(false);
			return;
		}
		// The chord player as the input: its panel comes out, since that is what is played.
		if (amp.fromChords && onchords && !chordsOpen) onchords();
		await amp.setOn(true);
		if (amp.error) notify(amp.error, { kind: "error" });
	}
	/**
	 * The amp comes on at the first touch of anything on it (a knob, a menu, an
	 * input chosen), as the piano wakes on its first touch: a browser starts audio
	 * and opens an input only from a gesture, so the first one is it. Off is
	 * then a choice made with the switch, which also closes the input.
	 */
	function wake(e: PointerEvent) {
		if (amp.on || amp.starting) return;
		// The switch itself and Mute handle their own press.
		if ((e.target as HTMLElement | null)?.closest("[data-amp-power], [data-amp-mute]")) return;
		void power();
	}
	async function setLevel() {
		const db = await amp.setLevel();
		notify(
			db === null
				? "Nothing was heard. Play while Set level listens."
				: `Trim set to ${db > 0 ? "+" : ""}${db} dB`,
			{ kind: db === null ? "error" : "success" },
		);
	}
	async function calibrate() {
		const ms = await amp.calibrate();
		notify(
			ms === null
				? "The clicks were not heard. Turn the speakers up (or take the headphones off) and try again."
				: `Round trip measured: ${Math.round(ms)} ms`,
			{ kind: ms === null ? "error" : "success" },
		);
	}
	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const trimText = (db: number) => `${db > 0 ? "+" : ""}${db} dB`;
	const onCount = $derived.by(() => {
		const p = amp.rig.pedals;
		return [
			p.gate.on,
			p.compressor.amount > 0,
			p.overdrive.drive > 0,
			p.fuzz.drive > 0,
			p.wah.mix > 0,
			p.chorus.mix > 0,
			p.phaser.mix > 0,
			p.delay.level > 0,
			p.rotary.speed !== "off",
		].filter(Boolean).length;
	});
</script>

{#snippet knob(
	label: string,
	value: number,
	oninput: (v: number) => void,
	opts: { min?: number; max?: number; step?: number; format?: (v: number) => string } = {},
)}
	<div class="grid justify-items-center gap-1 text-center">
		<Knob
			{value}
			min={opts.min ?? 0}
			max={opts.max ?? 1}
			step={opts.step ?? 0.01}
			size={40}
			{label}
			format={opts.format ?? pct}
			{oninput}
		/>
		<span class="text-11px uppercase tracking-wider text-dark/80 select-none">{label}</span>
	</div>
{/snippet}

{#snippet toggle(label: string, on: boolean, onclick: () => void)}
	<button
		class="device-button-xs px-3 {on ? 'text-accent' : ''}"
		type="button"
		aria-pressed={on}
		{onclick}>{label}</button
	>
{/snippet}

{#snippet inputMenu()}
	<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
		<div class="grid gap-2">
			<span class="device-button-label">Jack</span>
			<div class="flex flex-wrap gap-1" role="group" aria-label="Input jack">
				{#each [["line", "Line in"], ["mic", "Microphone input"], ["chords", "Chord player"]] as const as [id, label] (id)}
					<button
						class="device-button-xs px-3 {amp.source === id ? 'text-accent' : ''}"
						type="button"
						aria-pressed={amp.source === id}
						onclick={() => void amp.setSource(id as AmpSource)}>{label}</button
					>
				{/each}
			</div>
			<p class="text-12px opacity-70">
				Line in is an audio interface or a guitar-to-USB adapter; the microphone input is the
				computer's own jack with an instrument in it (or an acoustic through the microphone, which
				feeds back through the speakers). Chord player plays the chord player's own instrument
				through the amp, dry: its Electric Guitar (direct) or Electric Bass, to try the amp with
				nothing plugged in.
			</p>
		</div>
		<div class="grid grid-cols-[1fr_auto] gap-2 items-end {amp.fromChords ? 'hidden' : ''}">
			<label class="block">
				<span class="device-button-label">Device</span>
				<select
					class="device-field w-full"
					aria-label="Input device"
					value={inputSources.deviceIds[jack] ?? ""}
					onfocus={() => void inputSources.listInputs()}
					onchange={(e) => void inputSources.requestInput(jack, e.currentTarget.value || null)}
				>
					<option value="">Default input</option>
					{#each inputSources.inputs as d (d.id)}<option value={d.id}>{d.label}</option>{/each}
				</select>
			</label>
			<label class="block">
				<span class="device-button-label">Channels</span>
				<select
					class="device-field"
					aria-label="Input channels"
					value={inputSources.channelModes[jack]}
					onchange={(e) => inputSources.setChannelMode(jack, e.currentTarget.value as ChannelMode)}
				>
					<option value="stereo">Stereo</option>
					<option value="left">Left only</option>
					<option value="right">Right only</option>
				</select>
			</label>
		</div>
		{#if !amp.fromChords && inputSources.labels[jack]}
			<p class="text-12px opacity-70">Open: {inputSources.labels[jack]}.</p>
		{/if}
		<div class="border-t border-current/10 pt-3 grid gap-3">
			<div class="flex items-center gap-2 {amp.fromChords ? 'hidden' : ''}">
				<span class="device-button-label !mb-0">Plugged in</span>
				<InfoTip
					label="Instrument or line"
					text="A guitar's pickup wants a high-impedance instrument input; a computer's microphone jack is not one, so an instrument plugged straight in is quieter and a little duller than through an audio interface or a guitar-to-USB adapter, which have the right input. The browser cannot change the jack: this switch sets the starting trim (12 dB more for an instrument) and what the meter calls a good level."
				/>
			</div>
			<div class="flex gap-1 {amp.fromChords ? 'hidden' : ''}" role="group" aria-label="Plugged in">
				{#each [["instrument", "Instrument"], ["line", "Line level"]] as const as [id, label] (id)}
					<button
						class="device-button-xs px-3 {amp.inputMode === id ? 'text-accent' : ''}"
						type="button"
						aria-pressed={amp.inputMode === id}
						onclick={() => amp.setInputMode(id as AmpInputMode)}>{label}</button
					>
				{/each}
			</div>
			<label class="block">
				<span class="device-button-label">Trim · {trimText(amp.trimDb)}</span>
				<input
					class="w-full accent-maximumYellow"
					type="range"
					min={amp.fromChords ? -24 : -12}
					max="24"
					step="1"
					value={amp.trimDb}
					aria-label="Input trim in decibels"
					oninput={(e) => amp.setTrimDb(Number(e.currentTarget.value))}
				/>
			</label>
			<div class="flex flex-wrap gap-2">
				<button
					class="device-button-xs px-3"
					type="button"
					disabled={!amp.on || amp.settingLevel}
					onclick={setLevel}
				>
					{amp.settingLevel ? "Listening… play now" : "Set level"}
				</button>
				{#if !amp.fromChords}
					<button
						class="device-button-xs px-3"
						type="button"
						disabled={!amp.on || inputSources.calibrating}
						onclick={calibrate}
					>
						{inputSources.calibrating ? "Listening…" : "Calibrate latency"}
					</button>
				{/if}
			</div>
			<p class="text-12px opacity-70">
				{#if amp.fromChords}
					The chord player's sampled notes are loud and a chord sums louder: the trim starts at −12
					dB. Set level listens for three seconds and sets it so your loudest chord lands with
					headroom; the chord player's Volume works too.
				{:else}
					Set level listens for three seconds and sets the trim so your loudest notes land with
					headroom. Calibrate plays three clicks through the speakers and times them with the
					microphone.
				{/if}
			</p>
		</div>
	</div>
{/snippet}

{#snippet pedals()}
	<AmpPedalsMenu />
{/snippet}

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
	class="@container device-chrome grid grid-cols-1 gap-4 pb-14 px-3 py-4 @xl-px-5 @xl-pt-5 w-full max-w-full overflow-hidden relative"
	aria-label="Practice amp"
	onpointerdowncapture={wake}
>
	<div
		class="absolute bottom-6 left-5 text-nowrap text-12px uppercase font-sans text-oxford text-shadow opacity-90 font-600 select-none pointer-events-none"
	>
		SS Amp 001
	</div>

	<!-- toolbar -->
	<div class="flex flex-wrap items-end gap-2 @3xl-gap-3">
		<div>
			<div class="hidden @4xl-block device-button-group-label text-dark max-w-8">On</div>
			<div class="flex gap-px">
				<button
					class="device-button-sm px-3 rounded-r-none {amp.on
						? 'text-accent'
						: 'ring-2 ring-accent/60'}"
					type="button"
					data-amp-power
					aria-pressed={amp.on}
					aria-busy={amp.starting}
					aria-label={amp.on ? "Turn the amp off" : "Turn the amp on"}
					title={amp.on
						? "Turn the amp off (closes the input)"
						: "Turn the amp on (or touch anything on it)"}
					onclick={power}
				>
					<span
						class={amp.starting ? "i-ph-circle-notch animate-spin" : "i-ph-power"}
						aria-hidden="true"
					></span>
					<span class="hidden @2xl-inline"
						>{amp.starting ? "Starting…" : amp.on ? "On" : "Off"}</span
					>
				</button>
				<!-- Mute: the output off, the input open and the meters moving; red while engaged. -->
				<button
					class="device-button-sm px-3 rounded-l-none {amp.muted ? '!bg-red-600 !text-light' : ''}"
					type="button"
					data-amp-mute
					aria-pressed={amp.muted}
					aria-label={amp.muted ? "Unmute the amp" : "Mute the amp"}
					title={amp.muted ? "Unmute" : "Mute the output; the input stays open"}
					onclick={() => amp.setMuted(!amp.muted)}
				>
					<span
						class={amp.muted ? "i-ph-speaker-slash" : "i-ph-speaker-simple-high"}
						aria-hidden="true"
					></span>
					<span class="hidden @2xl-inline">{amp.muted ? "Muted" : "Mute"}</span>
				</button>
			</div>
		</div>
		<div>
			<div class="hidden @4xl-block device-button-group-label text-dark">Instrument</div>
			<div class="flex gap-px" role="group" aria-label="Instrument">
				{#each AMP_INSTRUMENTS as i (i)}
					<button
						class="device-button-sm px-3 {amp.instrument === i ? 'text-accent' : ''} {i === 'guitar'
							? 'rounded-r-none'
							: 'rounded-l-none'}"
						type="button"
						aria-pressed={amp.instrument === i}
						onclick={() => amp.setInstrument(i)}>{AMP_INSTRUMENT_LABELS[i]}</button
					>
				{/each}
			</div>
		</div>
		<div class="min-w-40">
			<div class="hidden @4xl-block device-button-group-label text-dark">Head</div>
			<ComboBox
				ariaLabel="Head"
				clearDefaultButtonClasses={true}
				popoverClasses="text-15px"
				buttonClasses="device-button-sm px-3 text-15px w-full"
				options={headOptions}
				value={amp.rig.model}
				onchange={(v) => amp.setModel(v as AmpModelId)}
			/>
		</div>
		{#if cabinetOptions.length > 1}
			<div class="min-w-44">
				<div class="hidden @4xl-block device-button-group-label text-dark">Cabinet</div>
				<ComboBox
					ariaLabel="Cabinet"
					clearDefaultButtonClasses={true}
					popoverClasses="text-15px"
					buttonClasses="device-button-sm px-3 text-15px w-full"
					options={cabinetOptions}
					value={head.cabinet}
					onchange={(v) => amp.setHead({ cabinet: v as typeof head.cabinet })}
				/>
			</div>
		{/if}
		<div>
			<div class="hidden @4xl-block device-button-group-label text-dark">Input</div>
			<ContextMenu
				ariaLabel="Input settings"
				label="Input"
				iconClass="i-ph-plugs"
				buttonBaseClasses="device-button-sm px-3"
				popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
				items={[{ id: "input", kind: "snippet", snippet: inputMenu }]}
			/>
		</div>
		<div>
			<div class="hidden @4xl-block device-button-group-label text-dark">Pedals</div>
			<ContextMenu
				ariaLabel="Pedals"
				label={onCount > 0 ? `Pedals · ${onCount}` : "Pedals"}
				iconClass="i-ph-sliders"
				buttonBaseClasses="device-button-sm px-3"
				buttonClasses={onCount > 0 ? "text-accent" : ""}
				popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
				items={[{ id: "pedals", kind: "snippet", snippet: pedals }]}
			/>
		</div>
		<!-- The tuner and the metronome: the page's panels, where the page has them (its own page; a host page shows what it has). -->
		<div class="flex gap-1 @4xl-ml-auto">
			{#if ontuner}
				<button
					class="device-button-sm px-3 {tunerOpen ? 'text-accent' : ''}"
					type="button"
					aria-pressed={tunerOpen}
					title={tunerOpen ? "Close the tuner" : "Tuner"}
					onclick={() => ontuner?.()}
				>
					<span class="i-ph-waveform" aria-hidden="true"></span>
					<span class="hidden @2xl-inline">Tuner</span>
				</button>
			{/if}
			{#if onmetronome}
				<button
					class="device-button-sm px-3 {metronomeOpen ? 'text-accent' : ''}"
					type="button"
					aria-pressed={metronomeOpen}
					title={metronomeOpen ? "Close the metronome" : "Metronome"}
					onclick={() => onmetronome?.()}
				>
					<span class="i-ph-metronome" aria-hidden="true"></span>
					<span class="hidden @2xl-inline">Metronome</span>
				</button>
			{/if}
			{#if onchords}
				<button
					class="device-button-sm px-3 {chordsOpen ? 'text-accent' : ''}"
					type="button"
					aria-pressed={chordsOpen}
					title={chordsOpen ? "Close the chord player" : "Chord player"}
					onclick={() => onchords?.()}
				>
					<span class="i-ph-circle-dashed" aria-hidden="true"></span>
					<span class="hidden @2xl-inline">Chords</span>
				</button>
			{/if}
			{#if ondrums}
				<button
					class="device-button-sm px-3 {drumsOpen ? 'text-accent' : ''}"
					type="button"
					aria-pressed={drumsOpen}
					title={drumsOpen ? "Close the drum machine" : "Drum machine"}
					onclick={() => ondrums?.()}
				>
					<span class="grid place-items-center" aria-hidden="true"><IconDrumKit /></span>
					<span class="hidden @2xl-inline">Drums</span>
				</button>
			{/if}
		</div>
	</div>

	<!-- the readout -->
	<div class="grid grid-cols-1 @xl-device-window-bevel-md max-w-full w-full overflow-hidden">
		<div
			class="grid grid-cols-1 gap-y-2 device-screen max-w-full py-3 w-full text-blue-100 font-mono tabular-nums overflow-hidden select-none {amp.on
				? ''
				: 'opacity-50'}"
		>
			<div class="flex flex-wrap items-baseline gap-x-3 gap-y-1">
				<span class="text-20px leading-none font-sans">{model.name}</span>
				<span class="text-12px opacity-70 font-sans text-wrap">{model.blurb}</span>
			</div>
			<div class="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 text-12px">
				<span class="opacity-70">in</span>
				<span
					class="block h-1.5 w-full rounded bg-blue-100/10 overflow-hidden"
					role="meter"
					aria-label="Input level"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(amp.inputLevel * 100)}
				>
					<span
						class="block h-full rounded {amp.inputLevel > 0.85 ? 'bg-red-500' : 'bg-blue-300'}"
						style:width="{amp.inputLevel * 100}%"
					></span>
				</span>
				<span
					class="w-2.5 h-2.5 rounded-full {amp.clip ? 'bg-red-500' : 'bg-blue-100/10'}"
					title="Clip"
					aria-label={amp.clip ? "Clipping" : "Not clipping"}
				></span>
				<span class="opacity-70">out</span>
				<span
					class="block h-1.5 w-full rounded bg-blue-100/10 overflow-hidden"
					role="meter"
					aria-label="Output level"
					aria-valuemin="0"
					aria-valuemax="100"
					aria-valuenow={Math.round(amp.outputLevel * 100)}
				>
					<span
						class="block h-full rounded {amp.outputLevel > 0.85 ? 'bg-red-500' : 'bg-green-300'}"
						style:width="{amp.outputLevel * 100}%"
					></span>
				</span>
				<span class="w-2.5 h-2.5 rounded-full {amp.on ? 'bg-green-400' : 'bg-oxford-800'}"></span>
			</div>
			<div class="text-12px opacity-80 flex flex-wrap gap-x-3 gap-y-1 font-sans" aria-live="polite">
				{#if !amp.on}
					<span class="text-light"
						>Off · touch the amp to turn it on · {amp.fromChords
							? "chord player"
							: `${amp.source === "line" ? "line in" : "microphone input"} · ${amp.inputMode} · trim ${trimText(amp.trimDb)}`}</span
					>
				{:else if amp.fromChords}
					<span>Chord player · dry in, the amp out · trim {trimText(amp.trimDb)}</span>
				{:else}
					<span
						class={verdict.tone === "good"
							? "text-green-300"
							: verdict.tone === "bad"
								? "text-red-300"
								: ""}>Latency {verdict.label}</span
					>
					{#if inputSources.labels[jack]}<span class="opacity-70"
							>· {inputSources.labels[jack]}</span
						>{/if}
					{#if amp.outputLabel}<span class="opacity-70">· out: {amp.outputLabel}</span>{/if}
				{/if}
			</div>
			{#if amp.on && verdict.advice}
				<p class="text-12px font-sans text-wrap opacity-80">{verdict.advice}</p>
			{/if}
			{#if amp.on && amp.mutedForFeedback}
				<p class="text-12px font-sans text-wrap text-amber-200/90">
					Muted to start: the microphone input into the speakers feeds back. Put headphones on, then
					press Mute to hear the amp.
				</p>
			{:else if amp.on && amp.muted}
				<p class="text-12px font-sans text-wrap opacity-80">
					Muted: the input is open, the output off.
				</p>
			{/if}
			{#if amp.error}
				<p class="text-12px font-sans text-wrap text-red-300" role="alert">{amp.error}</p>
			{/if}
		</div>
	</div>

	<!-- the head: the knobs in labelled groups, lined up as the piano's buttons are (Kevin's order), a blank label keeping an unlabelled group level with the rest -->
	<div class="grid gap-3">
		<div
			class="flex flex-wrap items-start gap-x-5 gap-y-3 @2xl-gap-x-7 [&_svg]-(text-dark) {amp.on
				? ''
				: 'opacity-60'}"
			role="group"
			aria-label="Head"
		>
			{#snippet group(label: string, body: import("svelte").Snippet)}
				<div role="group" aria-label={label || undefined}>
					<div class="device-button-group-label text-dark {label ? '' : 'invisible'}">
						{label || "·"}
					</div>
					<div class="flex items-start gap-x-3 @2xl-gap-x-4">{@render body()}</div>
				</div>
			{/snippet}
			{#snippet gainGroup()}
				{@render knob("Gain", head.gain, (v) => amp.setHead({ gain: v }))}
			{/snippet}
			{@render group("", gainGroup)}
			{#snippet eqGroup()}
				{@render knob("Bass", head.bass, (v) => amp.setHead({ bass: v }))}
				{@render knob("Mids", head.mid, (v) => amp.setHead({ mid: v }))}
				{#if model.switches.includes("midFreq")}
					{@render knob("Mid Hz", head.midFreq, (v) => amp.setHead({ midFreq: Math.round(v) }), {
						min: 0,
						max: 4,
						step: 1,
						format: (v) => `${AMP_MID_FREQUENCIES[Math.round(v)]} Hz`,
					})}
				{/if}
				{@render knob("Treble", head.treble, (v) => amp.setHead({ treble: v }))}
			{/snippet}
			{@render group("EQ", eqGroup)}
			{#if model.hasReverb}
				{#snippet reverbGroup()}
					{@render knob("Level", head.reverb, (v) => amp.setHead({ reverb: v }))}
				{/snippet}
				{@render group("Reverb", reverbGroup)}
			{/if}
			{#if model.hasTremolo}
				{#snippet tremoloGroup()}
					{@render knob("Depth", head.tremolo.depth, (v) => amp.setTremolo({ depth: v }))}
					{@render knob("Speed", head.tremolo.rate, (v) => amp.setTremolo({ rate: v }), {
						min: 0.5,
						max: 12,
						step: 0.1,
						format: (v) => `${v.toFixed(1)} Hz`,
					})}
				{/snippet}
				{@render group("Tremolo", tremoloGroup)}
			{/if}
			{#snippet outGroup()}
				{@render knob("Presence", head.presence, (v) => amp.setHead({ presence: v }))}
				<!-- Master pushes the power stage (sag and a softer clip); Output is the level into the room. -->
				{@render knob("Master", head.power, (v) => amp.setHead({ power: v }))}
				{@render knob("Output", head.master, (v) => amp.setHead({ master: v }))}
			{/snippet}
			{@render group("", outGroup)}
		</div>
		{#if sitePresets}
			<AmpPresets {sitePresets} {account} {presets} {presetAdmin} {readLink} />
		{/if}
		{#if model.switches.length > 0 || model.hasTremolo}
			<div class="flex flex-wrap gap-2" role="group" aria-label="Switches">
				{#if model.switches.includes("bright")}
					{@render toggle("Bright", head.bright, () => amp.setHead({ bright: !head.bright }))}
				{/if}
				{#if model.switches.includes("ultraLo")}
					{@render toggle("Ultra Lo", head.ultraLo, () => amp.setHead({ ultraLo: !head.ultraLo }))}
				{/if}
				{#if model.switches.includes("ultraHi")}
					{@render toggle("Ultra Hi", head.ultraHi, () => amp.setHead({ ultraHi: !head.ultraHi }))}
				{/if}
				{#if model.hasTremolo}
					{@render toggle("Trem: square", head.tremolo.shape === "square", () =>
						amp.setTremolo({ shape: head.tremolo.shape === "square" ? "sine" : "square" }),
					)}
				{/if}
			</div>
		{/if}
	</div>
</div>
