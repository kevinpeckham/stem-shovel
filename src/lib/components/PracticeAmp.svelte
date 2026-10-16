<script lang="ts">
	import { amp } from "#lib/audio/amp.svelte.js";
	import { inputSources, type ChannelMode, type InputSource } from "#lib/audio/inputs.svelte.js";

	// components
	import AmpPedalsMenu from "#lib/components/AmpPedalsMenu.svelte";
	import AmpPresets, { type SavedAmpPreset } from "#lib/components/AmpPresets.svelte";
	import ComboBox from "#lib/components/ComboBox.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import IconDrumKit from "#lib/components/IconDrumKit.svelte";
	import InfoTip from "#lib/components/InfoTip.svelte";
	import Knob from "#lib/components/Knob.svelte";

	// constants
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

	// svelte functions
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

	// power on function
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
			p.reverb.level > 0,
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
			activeLevelPathClasses=""
			clearDefaultKnobClasses={true}
			knobClasses="fill-dark stroke-light/10"
			showLevelPath={false}
			{value}
			min={opts.min ?? 0}
			max={opts.max ?? 1}
			step={opts.step ?? 0.01}
			size={54}
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

{#snippet toggleXs(label: string, on: boolean, onclick: () => void)}
	<div
		class="w-4 h-4 rounded-full {on
			? 'bg-dark p-1px inner-shadow shadow-black/40'
			: 'p-0.5px bg-dark/40 shadow'}"
	>
		<button
			class="block empty-block aspect-square w-full h-full rounded-full {on
				? 'bg-green shadow-none'
				: 'shadow-md bg-green-950 shadow-black/40'}"
			type="button"
			aria-pressed={on}
			aria-label={label}
			{onclick}
		></button>
	</div>
{/snippet}

{#snippet inputMenu()}
	<div class="px-3 pt-3 pb-4 grid gap-4 [&_span.device-button-label]-(block mb-2 text-blue-100/90)">
		<div class="grid gap-2">
			<div class="flex gap-2 items-center mb-2">
				<span class="font-600 leading-tight">Jack</span>
				<InfoTip
					text="Line in is an audio interface or a guitar-to-USB adapter; the microphone input is the
				computer's own jack with an instrument in it (or an acoustic through the microphone, which
				feeds back through the speakers). Chord player plays the chord player's own instrument
				through the amp, dry: its Electric Guitar (direct) or Electric Bass, to try the amp with
				nothing plugged in."
				/>
			</div>

			<div class="flex flex-wrap gap-3" role="group" aria-label="Input jack">
				{#each [["line", "Line in"], ["mic", "Microphone"], ["chords", "Chord Player"]] as const as [id, label] (id)}
					<button
						class="button-outline {amp.source === id ? '!text-accent' : ''}"
						type="button"
						aria-pressed={amp.source === id}
						onclick={() => void amp.setSource(id as AmpSource)}>{label}</button
					>
				{/each}
			</div>
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
			{#if amp.fromChords}
				<p class="text-12px opacity-70">
					The chord player's sampled notes are loud and a chord sums louder: the trim starts at −12
					dB. Set level sets it so your loudest chord lands with headroom; the chord player's Volume
					works too.
				</p>
			{/if}
			<div class="grid grid-cols-2 gap-2">
				<!-- set level -->
				<div class="grid grid-cols-1 gap-y-2">
					<div class="flex gap-2 items-center justify-center">
						<h6 class="font-500 leading-tight opacity-90">Set Level</h6>
						<InfoTip
							text="Set level listens for three seconds and sets the trim so your loudest notes land with headroom."
						/>
					</div>
					<button
						class="button-outline"
						type="button"
						disabled={!amp.on || amp.settingLevel}
						onclick={setLevel}
					>
						{amp.settingLevel ? "Listening… play now" : "Set"}
					</button>
				</div>

				<!-- calibrate -->
				{#if !amp.fromChords}
					<div class="grid grid-cols-1 gap-y-2">
						<div class="flex gap-2 items-center justify-center">
							<h6 class="font-500 leading-tight opacity-90">Calibrate Latency</h6>
							<InfoTip
								text="Calibrate plays three clicks through the speakers and times them with the microphone, for the latency readout."
							/>
						</div>
						<button
							class="button-outline"
							type="button"
							disabled={!amp.on || inputSources.calibrating}
							onclick={calibrate}
						>
							{inputSources.calibrating ? "Listening…" : "Calibrate"}
						</button>
					</div>
				{/if}
			</div>
		</div>
	</div>
{/snippet}

{#snippet pedals()}
	<AmpPedalsMenu />
{/snippet}

<div class="grid gap-4">
	{#if ontuner || onmetronome || onchords || ondrums}
		<!-- The companions, above the face rather than on it (Kevin): the page's panels where the page has them, so an embedding of the amp keeps them. -->
		<div
			class="flex flex-wrap justify-end gap-2"
			role="toolbar"
			aria-label="Practice amp companions"
		>
			{#if ontuner}
				<button
					class="button button-sm shrink-0 {tunerOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={tunerOpen}
					aria-label={tunerOpen ? "Close the tuner" : "Tuner"}
					title={tunerOpen ? "Close the tuner" : "Open the tuner"}
					onclick={() => ontuner?.()}
				>
					<span class="i-ph-waveform" aria-hidden="true"></span>
					<span class="hidden sm-inline">Tuner</span>
				</button>
			{/if}
			{#if onmetronome}
				<button
					class="button button-sm shrink-0 {metronomeOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={metronomeOpen}
					aria-label={metronomeOpen ? "Close the metronome" : "Metronome"}
					title={metronomeOpen ? "Close the metronome" : "Open the metronome"}
					onclick={() => onmetronome?.()}
				>
					<span class="i-ph-metronome" aria-hidden="true"></span>
					<span class="hidden sm-inline">Metronome</span>
				</button>
			{/if}
			{#if onchords}
				<button
					class="button button-sm shrink-0 {chordsOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={chordsOpen}
					aria-label={chordsOpen ? "Close the chord player" : "Chord player"}
					title={chordsOpen ? "Close the chord player" : "Open the chord player"}
					onclick={() => onchords?.()}
				>
					<span class="i-ph-circle-dashed" aria-hidden="true"></span>
					<span class="hidden sm-inline">Chords</span>
				</button>
			{/if}
			{#if ondrums}
				<button
					class="button button-sm shrink-0 {drumsOpen
						? 'bg-accent text-oxford border-accent opacity-100'
						: ''}"
					type="button"
					aria-pressed={drumsOpen}
					aria-label={drumsOpen ? "Close the drum machine" : "Drum machine"}
					title={drumsOpen ? "Close the drum machine" : "Open the drum machine"}
					onclick={() => ondrums?.()}
				>
					<span class="grid place-items-center" aria-hidden="true"><IconDrumKit /></span>
					<span class="hidden sm-inline">Drums</span>
				</button>
			{/if}
		</div>
	{/if}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<h2 class="sr-only">Amp</h2>
	<div
		class="
			@container
			border
			border-current/10
			bg-black
			bg-gradient-to-br
			from-slate-950/40
			to-slate-950/60
			grid
			grid-cols-1
			gap-y-6
			px-8 pt-4
			pb-24
			w-full
			max-w-full
			overflow-hidden
			relative
			rounded-xl
			shadow-md
			shadow-oxford
			h-auto"
		aria-label="Practice amp"
		onpointerdowncapture={wake}
	>
		<!-- toolbar -->
		<h3 class="sr-only">Toolbar</h3>
		<div class="flex flex-wrap items-end gap-3 @3xl-gap-4 text-14px">
			<!-- Instrument Select -->
			<div>
				<h4 class="sr-only">Instrument Selection</h4>
				<div class="flex gap-0px" role="group" aria-label="Instrument">
					{#each AMP_INSTRUMENTS as i (i)}
						<button
							class="button-outline {amp.instrument === i
								? 'bg-accent text-dark hover-text-dark hover-bg-accent/85 border border-accent opacity-100'
								: 'opacity-90 text-accent'} {i === 'guitar' ? 'rounded-r-none' : 'rounded-l-none'}"
							type="button"
							aria-pressed={amp.instrument === i}
							onclick={() => amp.setInstrument(i)}>{AMP_INSTRUMENT_LABELS[i]}</button
						>
					{/each}
				</div>
			</div>

			<!-- Input Select -->
			<div>
				<h4 class="sr-only">Input Selection</h4>
				<ContextMenu
					ariaLabel="Input settings"
					label="Input"
					iconClass="i-ph-plugs"
					buttonBaseClasses="button-outline"
					popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[{ id: "input", kind: "snippet", snippet: inputMenu }]}
				/>
			</div>

			<!-- Amp Head Select -->
			<div>
				<h4 class="sr-only">Head Selection</h4>
				<ComboBox
					ariaLabel="Head"
					clearDefaultButtonClasses={true}
					popoverClasses=""
					buttonClasses="button-outline"
					options={headOptions}
					value={amp.rig.model}
					onchange={(v) => amp.setModel(v as AmpModelId)}
				/>
			</div>

			<!-- Cabinet Select -->
			{#if cabinetOptions.length > 1}
				<div>
					<h4 class="sr-only">Cabinet Selection</h4>
					<ComboBox
						ariaLabel="Cabinet"
						clearDefaultButtonClasses={true}
						popoverClasses=""
						buttonClasses="button-outline"
						options={cabinetOptions}
						value={head.cabinet}
						onchange={(v) => amp.setHead({ cabinet: v as typeof head.cabinet })}
					/>
				</div>
			{/if}

			<div>
				<h4 class="sr-only">Pedals</h4>
				<ContextMenu
					ariaLabel="Pedals"
					label={onCount > 0 ? `Pedals · ${onCount}` : "Pedals"}
					iconClass="i-ph-sliders"
					buttonBaseClasses="button-outline"
					buttonClasses={onCount > 0 ? "text-accent" : ""}
					popoverClasses="min-w-72 @xl-min-w-96 max-w-lg !max-h-[calc(100%-0.5rem)] overflow-y-auto"
					items={[{ id: "pedals", kind: "snippet", snippet: pedals }]}
				/>
			</div>
		</div>

		<!-- the readout -->
		<div
			class="grid grid-cols-1 @xl-device-window-bevel-md max-w-full w-full overflow-hidden relative border-light/80"
		>
			<div
				class="grid grid-cols-1 gap-y-2 bg-oxford/20 max-w-full py-3 w-full text-blue-100 font-mono tabular-nums overflow-hidden select-none px-4 py-6 min-h-140px"
			>
				<div class="grid grid-cols-1 items-baseline gap-x-3 gap-y-3">
					<div class="text-20px leading-none font-sans">{model.name}</div>
					<div class="text-12px opacity-70 font-sans text-wrap">{model.blurb}</div>
				</div>

				<div
					class="text-12px opacity-80 flex flex-wrap gap-x-3 gap-y-1 font-sans"
					aria-live="polite"
				>
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
						Muted to start: the microphone input into the speakers feeds back. Put headphones on,
						then press Mute to hear the amp.
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

		<!-- the head: the knobs in labeled groups, lined up as the piano's buttons are (Kevin's order), a blank label keeping an unlabelled group level with the rest -->
		<div
			class="
			bg-#BDA784
			bg-gradient-br
			from-dark/10
			grid
			grid-cols-1
			gap-y-0
			inner-shadow
			max-w-full
			min-h-240px
			overflow-x-hidden
			px-4
			pt-4
			pb-6
			relative
			rounded-lg
			text-dark
			to-black/15
			via-black/5
			w-full
			xl-pr-200px"
		>
			<div
				class="
					flex
					flex-wrap
					gap-x-5
					gap-y-5
					items-start
					"
				role="group"
				aria-label="Head"
			>
				<!-- Power & Meters -->
				<div
					class="
					flex
					gap-x-4
					gap-y-8
					w-full
					sm-grid
					sm-grid-cols-2
					xl-absolute
					xl-grid-cols-1
					xl-max-w-200px
					xl-top-6
					xl-right-6"
				>
					<!-- power & mute -->
					<div class="flex items-center h-auto xl-ml-auto w-full max-w-fit">
						<!-- <div class="hidden @4xl-block text-dark max-w-8">On</div> -->
						<div class="flex gap-px bg-dark/60 rounded-md overflow-hidden">
							<button
								class="device-button-sm min-w-60px px-3 rounded-r-none bg-slate-950 {amp.on
									? '!text-light'
									: ''}"
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
								<!-- <span
									class={amp.starting ? "i-ph-circle-notch animate-spin" : "i-ph-power"}
									aria-hidden="true"
								></span> -->
								<span
									class="w-2 h-2 rounded-full {amp.on
										? 'bg-green-500 shadow-md shadow-green-500/20'
										: 'bg-green-950'} "
								></span>
								<span class="hidden @2xl-inline">Power</span>
							</button>
							<!-- Mute: the output off, the input open and the meters moving; red while engaged. -->
							<button
								class="device-button-sm min-w-60px px-3 rounded-l-none bg-slate-950 {amp.muted
									? '!text-light '
									: ''}"
								type="button"
								data-amp-mute
								aria-pressed={amp.muted}
								aria-label={amp.muted ? "Unmute the amp" : "Mute the amp"}
								title={amp.muted ? "Unmute" : "Mute the output; the input stays open"}
								onclick={() => amp.setMuted(!amp.muted)}
							>
								<!-- <span
									class={amp.muted ? "i-ph-speaker-slash" : "i-ph-speaker-simple-high"}
									aria-hidden="true"
								></span> -->
								<span
									class="w-2 h-2 rounded-full {amp.muted
										? 'bg-red-500 shadow-md shadow-red-500/20'
										: 'bg-red-950'} "
								></span>
								<span class="hidden @2xl-inline">Mute</span>
							</button>
						</div>
					</div>

					<!-- level meter -->
					<div class="w-full grid grid-cols-1 items-center gap-x-2 gap-y-1 text-12px">
						{#each ["in", "out"] as meter, i}
							{@const level = meter === "out" ? amp.outputLevel : amp.inputLevel}

							<!-- meter group  -->
							<div class="grid grid-cols-[20px_1fr_auto] items-center gap-x-3">
								<!-- label -->
								<span class="opacity-80 text-dark font-500 uppercase tracking-wide text-right"
									>{meter}</span
								>

								<!-- meter -->
								<div class="bg-dark rounded">
									<span
										class="block h-1.5 w-full rounded bg-blue-100/10 overflow-hidden"
										role="meter"
										aria-label="{meter}put level"
										aria-valuemin="0"
										aria-valuemax="100"
										aria-valuenow={Math.round(level * 100)}
									>
										<span
											class="block h-full rounded {level > 0.85
												? 'bg-red-500 shadow-md shadow-red-500'
												: 'bg-green-500 shadow-md shadow-green-500'}"
											style:width="{level * 100}%"
										></span>
									</span>
								</div>

								<!-- IN: the clip light, red while a peak reaches full scale; OUT: the power lamp. -->
								{#if meter === "in"}
									<span
										class="w-2.5 h-2.5 rounded-full {amp.clip
											? 'bg-red-500 shadow-md shadow-red-500/60'
											: 'bg-red-950'}"
										title="Clip"
										aria-label={amp.clip ? "Clipping" : "Not clipping"}
									></span>
								{:else}
									<span
										class="w-2.5 h-2.5 rounded-full {amp.on
											? 'bg-green-500 shadow-md shadow-green-500/40'
											: 'bg-green-950'}"
										title={amp.on ? "On" : "Off"}
										aria-label={amp.on ? "The amp is on" : "The amp is off"}
									></span>
								{/if}
							</div>
						{/each}
					</div>
				</div>

				{#snippet group(label: string, body: import("svelte").Snippet)}
					<div class="grid grid-cols-1 gap-y-2" role="group" aria-label={label || undefined}>
						<!-- group heading -->
						<div
							class="grid grid-cols-[1fr_auto_1fr] gap-x-2 text-dark text-11px uppercase tracking-wider text-center {label
								? ''
								: 'invisible'}"
						>
							<div class="flex items-center">
								<div class="border-t border-black/80 w-full h-1px !empty-block"></div>
							</div>
							<div class="leading-none">{label || "·"}</div>
							<div class="flex items-center">
								<div class="border-t border-black/80 w-full h-1px !empty-block"></div>
							</div>
						</div>
						<!-- group body -->
						<div class="flex items-start gap-x-3">{@render body()}</div>
					</div>
				{/snippet}

				<!-- gain group -->
				{#snippet gainGroup()}
					{@render knob("Gain", head.gain, (v) => amp.setHead({ gain: v }))}
				{/snippet}
				{@render group("", gainGroup)}

				<!-- EQ Group -->
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
					{#if model.switches.includes("bright")}
						<div
							class="grid grid-cols-1 text-9.5px uppercase tracking-narrow text-dark place-content-center place-items-center"
						>
							<div>Bright</div>
							{@render toggleXs("Bright", head.bright, () => amp.setHead({ bright: !head.bright }))}
						</div>
					{/if}
					{#if model.switches.includes("ultraLo")}
						<div
							class="grid grid-cols-1 text-9.5px uppercase tracking-narrow text-dark place-content-center place-items-center"
						>
							<div class="leading-tight mb-1">+ Low</div>
							{@render toggleXs("Ultra Lo", head.ultraLo, () =>
								amp.setHead({ ultraLo: !head.ultraLo }),
							)}
						</div>
					{/if}
					{#if model.switches.includes("ultraHi")}
						<div
							class="grid grid-cols-1 text-9.5px uppercase tracking-narrow text-dark place-content-center place-items-center"
						>
							<div class="leading-tight mb-1">+ High</div>
							{@render toggleXs("Ultra Hi", head.ultraHi, () =>
								amp.setHead({ ultraHi: !head.ultraHi }),
							)}
						</div>
					{/if}
				{/snippet}
				{@render group("EQ", eqGroup)}

				<!-- Reverb Group -->
				{#if model.hasReverb}
					{#snippet reverbGroup()}
						{@render knob("Level", head.reverb, (v) => amp.setHead({ reverb: v }))}
					{/snippet}
					{@render group("Reverb", reverbGroup)}
				{/if}

				<!-- Tremolo Group -->
				{#if model.hasTremolo}
					{#snippet tremoloGroup()}
						{@render knob("Depth", head.tremolo.depth, (v) => amp.setTremolo({ depth: v }))}
						{@render knob("Speed", head.tremolo.rate, (v) => amp.setTremolo({ rate: v }), {
							min: 0.5,
							max: 12,
							step: 0.1,
							format: (v) => `${v.toFixed(1)} Hz`,
						})}
						{#if model.hasTremolo}
							<div
								class="grid grid-cols-1 text-9.5px uppercase tracking-narrow text-dark place-content-center place-items-center"
							>
								<div>Square</div>
								{@render toggleXs("Square", head.tremolo.shape === "square", () =>
									amp.setTremolo({ shape: head.tremolo.shape === "square" ? "sine" : "square" }),
								)}
							</div>
						{/if}
					{/snippet}
					{@render group("Tremolo", tremoloGroup)}
				{/if}

				<!-- Out Group -->
				{#snippet outGroup()}
					{@render knob("Presence", head.presence, (v) => amp.setHead({ presence: v }))}
					<!-- Master pushes the power stage (sag and a softer clip); Output is the level into the room. -->
					{@render knob("Master", head.power, (v) => amp.setHead({ power: v }))}
					{@render knob("Output", head.master, (v) => amp.setHead({ master: v }))}
				{/snippet}
				{@render group("", outGroup)}

				<!-- presets -->
				{#if sitePresets}
					<div class="flex items-center h-auto sm-h-90px text-light xl-w-full">
						<AmpPresets {sitePresets} {account} {presets} {presetAdmin} {readLink} />
					</div>
				{/if}

				<!-- branding -->
				<div
					class="absolute bottom-6 right-6 text-nowrap text-12px uppercase font-sans text-dark/80 text-shadow opacity-90 font-600 select-none pointer-events-none"
				>
					SS Amp 001
				</div>
			</div>
		</div>
	</div>
</div>
