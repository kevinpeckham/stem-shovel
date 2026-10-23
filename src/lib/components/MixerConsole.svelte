<script lang="ts">
	import ComboBox from "#lib/components/ComboBox.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import InsertPanel from "#lib/components/InsertPanel.svelte";
	import Knob from "#lib/components/Knob.svelte";
	import LevelMeter from "#lib/components/LevelMeter.svelte";
	import { STEM_TINTS, stemTintHex } from "#lib/constants/stemTints.js";
	import { STUDIO_FADER_MAX } from "#lib/constants/studio.js";
	import { sendLaneKey } from "#lib/constants/studioInserts.js";
	import { studio } from "#lib/audio/studio.svelte.js";
	import { insertsOf } from "#lib/utils/insertsFromFx.js";
	import type { StudioInsert, StudioTrack } from "#lib/val/StudioSchema.js";

	/**
	 * Dawn's mixer console (docs/dawn-daw-plan.md, D2): a strip per track,
	 * per bus and the master, side by side: the name, where it goes, its
	 * inserts (InsertPanel in a popover), its sends to the buses, the pan,
	 * the fader, mute and solo, the meter. The same engine the timeline
	 * drives; a fader or a send on a strip with a lane writes a point at the
	 * playhead, as the knobs do.
	 */
	const engine = studio;
	const buses = $derived(engine.arrangement.buses ?? []);
	const levelText = (v: number) => (v <= 0 ? "−∞ dB" : `${Math.round(20 * Math.log10(v))} dB`);
	const panText = (v: number) =>
		v === 0 ? "C" : v < 0 ? `L ${Math.round(-v * 100)}` : `R ${Math.round(v * 100)}`;
	const pct = (v: number) => `${Math.round(v * 100)}%`;
	const isMidi = (t: StudioTrack) => t.kind === "midi";
	const automatedKeys = (owner: { automation?: Record<string, unknown> }) =>
		new Set(Object.keys(owner.automation ?? {}));
	const outputOptions = $derived([
		{ value: "", label: "Master" },
		...buses.map((b) => ({ value: b.id, label: b.name })),
	]);
	const sendLevel = (t: StudioTrack, busId: string) =>
		engine.automatedValue(t.id, sendLaneKey(busId));
	function fader(id: string, v: number, bus = false) {
		if (bus) engine.setBusGain(id, v);
		else engine.setGain(id, v);
	}
</script>

{#snippet inserts(
	ownerId: string,
	owner: { inserts?: StudioInsert[]; automation?: Record<string, unknown> },
	label: string,
)}
	<ContextMenu
		ariaLabel="{label} inserts"
		label="Inserts"
		labelClasses="text-11px"
		dataActive={insertsOf(owner).length > 0}
		iconClass="i-ph-sliders-horizontal"
		clearButtonBaseClasses={true}
		buttonClasses="flex w-full items-center justify-center gap-1 h-6 rounded border border-white/15 bg-oxford-800 text-11px data-[active=true]:text-accent"
		position="bottom left"
		popoverClasses="min-w-72 max-w-sm !max-h-[calc(100vh-2rem)] overflow-y-auto"
		items={[
			{ id: "h", kind: "heading", label: `${label} inserts` },
			{ id: "p", kind: "snippet", snippet: insertsBody },
		]}
	/>
	{#snippet insertsBody()}
		<div class="px-3 pt-2 pb-3">
			<InsertPanel
				inserts={insertsOf(owner)}
				{label}
				automated={automatedKeys(owner)}
				onchange={(list) => engine.setInserts(ownerId, list)}
			/>
		</div>
	{/snippet}
{/snippet}

{#snippet meterOf(id: string, label: string)}
	<LevelMeter
		class="w-full"
		state={engine.levels[id]}
		{label}
		onreset={() => engine.resetClips(id)}
	/>
{/snippet}

<div
	class="flex gap-2 overflow-x-auto rounded-md border border-white/10 bg-dark p-2"
	role="group"
	aria-label="Mixer"
	data-mixer-console
>
	{#each engine.arrangement.tracks as track (track.id)}
		{@const tint = stemTintHex(track.colour)}
		{@const dim = track.muted || (engine.anySolo && !track.solo)}
		<section
			class="grid w-36 shrink-0 content-start gap-2 rounded border border-white/10 bg-oxford-900 p-2"
			aria-label="{track.name} strip"
			data-strip={track.id}
		>
			<span
				class="truncate text-13px font-500 text-blue-300 {dim ? 'opacity-60' : ''}"
				style:color={tint && !dim ? tint : undefined}
				title={track.name}>{track.name}</span
			>
			{#if isMidi(track)}
				<span class="text-11px text-dim">MIDI: its instrument carries the sound</span>
			{:else}
				<label class="grid gap-0.5 text-10px text-dim">
					Output
					<ComboBox
						ariaLabel="{track.name} output"
						options={outputOptions}
						value={track.output ?? ""}
						onchange={(v) => engine.setOutput(track.id, v || null)}
						clearDefaultButtonClasses
						buttonClasses="flex w-full items-center gap-1 h-6 px-1 rounded border border-white/15 bg-oxford-800 text-11px text-left truncate"
						popoverClasses="text-11px"
					/>
				</label>
				{@render inserts(track.id, track, track.name)}
				{#if buses.length}
					<div class="grid gap-1" role="group" aria-label="{track.name} sends">
						{#each buses as bus (bus.id)}
							<div class="flex items-center gap-1.5 text-10px">
								<Knob
									value={sendLevel(track, bus.id)}
									min={0}
									max={1}
									step={0.01}
									resetTo={0}
									size={18}
									label="{track.name} send to {bus.name}"
									title="Send to {bus.name} (double-click for none)"
									format={pct}
									oninput={(v) => engine.setSend(track.id, bus.id, v)}
								/>
								<span class="truncate opacity-70">{bus.name}</span>
							</div>
						{/each}
					</div>
				{/if}
				<div class="flex items-center justify-center gap-2">
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
				</div>
			{/if}
			<input
				type="range"
				class="w-full accent-maximumYellow"
				min="0"
				max={STUDIO_FADER_MAX}
				step="0.01"
				value={engine.automatedValue(track.id, "volume")}
				aria-label="{track.name} level"
				aria-valuetext={levelText(engine.automatedValue(track.id, "volume"))}
				oninput={(e) => fader(track.id, e.currentTarget.valueAsNumber)}
			/>
			<div class="flex items-center justify-center gap-1">
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
			</div>
			{@render meterOf(track.id, track.name)}
		</section>
	{/each}

	{#each buses as bus (bus.id)}
		{@const tint = stemTintHex(bus.colour)}
		<section
			class="grid w-36 shrink-0 content-start gap-2 rounded border border-accent/30 bg-oxford-900 p-2"
			aria-label="{bus.name} bus strip"
			data-strip={bus.id}
		>
			<div class="flex items-center gap-1">
				<input
					class="min-w-0 w-full bg-transparent text-13px font-500 text-blue-300 outline-none rounded px-1 hover-bg-white/5 focus-bg-white/10 {bus.muted
						? 'opacity-60'
						: ''}"
					style:color={tint && !bus.muted ? tint : undefined}
					type="text"
					maxlength="60"
					value={bus.name}
					aria-label="Bus name"
					onchange={(e) => engine.renameBus(bus.id, e.currentTarget.value)}
					onkeydown={(e) => {
						if (e.key === "Enter") e.currentTarget.blur();
					}}
				/>
				<ContextMenu
					ariaLabel="{bus.name} actions"
					clearButtonBaseClasses={true}
					buttonClasses="device-fader-menu-button-subtle"
					position="bottom right"
					items={[
						{ id: "tint", kind: "snippet", snippet: busTint },
						{ id: "d", kind: "divider" },
						{
							id: "remove",
							kind: "button",
							label: "Remove bus",
							iconClass: "i-ph-trash",
							title: "Tracks on it go to the master; sends to it are dropped",
							action: () => engine.removeBus(bus.id),
						},
					]}
				/>
				{#snippet busTint()}
					<div class="px-3 py-1.5" role="group" aria-label="{bus.name} tint">
						<div class="mb-1 text-xs text-dim">Tint</div>
						<div class="flex flex-wrap gap-1.5">
							<button
								type="button"
								class="h-5 w-5 rounded-full border {bus.colour
									? 'border-white/30 hover:border-white/70'
									: 'border-white ring-1 ring-white/60'} bg-blue-300/60"
								aria-label="No tint"
								onclick={() => engine.setBusTint(bus.id, null)}
							></button>
							{#each STEM_TINTS as t (t.id)}
								<button
									type="button"
									class="h-5 w-5 rounded-full border {bus.colour === t.id
										? 'border-white ring-1 ring-white/60'
										: 'border-white/30 hover:border-white/70'}"
									style:background-color={t.hex}
									aria-label="Tint {t.name}"
									onclick={() => engine.setBusTint(bus.id, t.id)}
								></button>
							{/each}
							<!-- Any color (docs/multitrack-recorder.md "Track colors"): a round swatch over the browser's color picker; it wears the color once one is chosen. -->
							<label
								class="relative h-5 w-5 overflow-hidden rounded-full border cursor-pointer {(bus.colour?.startsWith(
									'#',
								) ?? false)
									? 'border-white ring-1 ring-white/60'
									: 'border-white/30 hover:border-white/70'}"
								style:background={(bus.colour?.startsWith("#") ?? false)
									? bus.colour
									: "conic-gradient(#c98a9c, #d2bc8f, #95b59a, #7fb2c2, #a99bc9, #c98a9c)"}
								title="Any color"
							>
								<input
									type="color"
									class="absolute -inset-2 h-9 w-9 cursor-pointer opacity-0"
									aria-label="Any color"
									value={stemTintHex(bus.colour) ?? "#7fb2c2"}
									oninput={(e) => engine.setBusTint(bus.id, e.currentTarget.value)}
								/>
							</label>
						</div>
					</div>
				{/snippet}
			</div>
			<span class="text-10px text-dim">Bus · to the master</span>
			{@render inserts(bus.id, bus, bus.name)}
			<div class="flex items-center justify-center">
				<Knob
					value={engine.automatedValue(bus.id, "pan")}
					min={-1}
					max={1}
					step={0.05}
					resetTo={0}
					bipolar
					size={26}
					label="{bus.name} pan"
					title="Pan (double-click for center)"
					format={panText}
					oninput={(v) => engine.setBusPan(bus.id, v)}
				/>
			</div>
			<input
				type="range"
				class="w-full accent-maximumYellow"
				min="0"
				max={STUDIO_FADER_MAX}
				step="0.01"
				value={engine.automatedValue(bus.id, "volume")}
				aria-label="{bus.name} level"
				aria-valuetext={levelText(engine.automatedValue(bus.id, "volume"))}
				oninput={(e) => fader(bus.id, e.currentTarget.valueAsNumber, true)}
			/>
			<div class="flex items-center justify-center gap-1">
				<button
					type="button"
					class="device-fader-button-sm"
					aria-pressed={bus.muted}
					aria-label="Mute {bus.name}"
					onclick={() => engine.toggleBusMute(bus.id)}>M</button
				>
			</div>
			{@render meterOf(bus.id, bus.name)}
		</section>
	{/each}

	<!-- the master -->
	<section
		class="grid w-36 shrink-0 content-start gap-2 rounded border border-maximumYellow/40 bg-oxford-900 p-2"
		aria-label="Master strip"
		data-strip="master"
	>
		<span class="text-13px font-500">Master</span>
		<button
			type="button"
			class="button button-xs"
			title="A new bus: tracks route or send to it, with its own inserts, level and pan"
			onclick={() => engine.addBus()}
		>
			<span class="i-ph-plus" aria-hidden="true"></span> Add bus
		</button>
		{@render inserts("master", { inserts: engine.arrangement.masterInserts }, "Master")}
		<input
			type="range"
			class="w-full accent-maximumYellow"
			min="0"
			max="1"
			step="0.01"
			value={engine.automatedValue("master", "volume")}
			aria-label="Master level"
			aria-valuetext={levelText(engine.automatedValue("master", "volume"))}
			oninput={(e) => engine.setMaster(e.currentTarget.valueAsNumber)}
		/>
		<LevelMeter
			class="w-full"
			state={engine.masterLevel}
			label="Master"
			onreset={() => engine.resetClips()}
		/>
	</section>
</div>
