<script lang="ts">
	import {
		DEFAULT_PLAYBACK_EQ,
		isFlat,
		PLAYBACK_EQ_MAX_DB,
		PLAYBACK_EQ_MIN_DB,
		type PlaybackEqSettings,
	} from "#lib/audio/playbackEq.js";

	/**
	 * The session player's playback EQ panel (SessionPlayer's EQ button opens
	 * it): a high-pass for rumble, three bands and Reset. It holds no state:
	 * every change hands the player a new settings object.
	 */
	interface Props {
		/** The popover's id, for the button that opens it. */
		id: string;
		settings: PlaybackEqSettings;
		onchange: (settings: PlaybackEqSettings) => void;
	}
	let { id, settings, onchange }: Props = $props();

	let flat = $derived(isFlat(settings));
	const bands = [
		{ key: "low", label: "Low", hint: "200 Hz shelf" },
		{ key: "mid", label: "Mid", hint: "1 kHz" },
		{ key: "high", label: "High", hint: "4 kHz shelf" },
	] as const;
	function setBand(band: "low" | "mid" | "high", e: Event) {
		onchange({ ...settings, [band]: Number((e.currentTarget as HTMLInputElement).value) });
	}
	/** A gain as the panel shows it: "+3.5 dB", "0 dB", "−6 dB" (a real minus sign). */
	function formatDb(v: number) {
		return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} dB`;
	}
</script>

<!-- The playback EQ's panel: a high-pass for rumble and three bands, remembered on this device. -->
<div
	{id}
	popover="auto"
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(22rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	aria-label="Playback EQ"
>
	<div class="mb-4 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">Playback EQ</h2>
		<button class="button button-xs" type="button" popovertarget={id} popovertargetaction="hide">
			Close
		</button>
	</div>
	<label class="mb-4 flex items-start gap-3">
		<input
			type="checkbox"
			class="mt-1 accent-maximumYellow"
			checked={settings.highPass}
			onchange={(e) => onchange({ ...settings, highPass: e.currentTarget.checked })}
		/>
		<span>
			High-pass (80 Hz)
			<span class="block text-sm text-dim">Cuts rumble: stage thumps, wind and handling noise.</span
			>
		</span>
	</label>
	{#each bands as band (band.key)}
		<label class="mb-3 block">
			<span class="flex items-baseline justify-between gap-2 text-sm">
				<span>{band.label} <span class="text-dim">· {band.hint}</span></span>
				<span class="tabular-nums" data-testid="eq-{band.key}-value"
					>{formatDb(settings[band.key])}</span
				>
			</span>
			<input
				type="range"
				class="w-full accent-maximumYellow"
				min={PLAYBACK_EQ_MIN_DB}
				max={PLAYBACK_EQ_MAX_DB}
				step="0.5"
				value={settings[band.key]}
				oninput={(e) => setBand(band.key, e)}
				aria-valuetext={formatDb(settings[band.key])}
			/>
		</label>
	{/each}
	<div class="mt-4 flex justify-end">
		<button
			class="button button-xs"
			type="button"
			disabled={flat}
			onclick={() => onchange({ ...DEFAULT_PLAYBACK_EQ })}
		>
			Reset
		</button>
	</div>
</div>
