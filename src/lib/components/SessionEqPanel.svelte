<script lang="ts">
	import {
		EQ_BAND_SPECS,
		EQ_BANDS,
		EQ_HIGH_PASS_HZ,
		PLAYBACK_EQ_MAX_DB,
		PLAYBACK_EQ_MIN_DB,
		type EqBand,
	} from "#lib/constants/playbackEq.js";
	import type { PlaybackEqSettings } from "#lib/val/PlaybackEqSchema.js";

	/**
	 * The session player's playback EQ panel (SessionPlayer's EQ button opens
	 * it): a high-pass for rumble and five bands, each a gain and a center
	 * on a log scale, with the session's actions (Auto, Reset, Download with EQ,
	 * Save for everyone or Remove shared EQ). It holds no state: every change
	 * hands the player a new settings object, and the actions are the
	 * player's.
	 */
	interface Props {
		/** The popover's id, for the button that opens it. */
		id: string;
		settings: PlaybackEqSettings;
		onchange: (settings: PlaybackEqSettings) => void;
		/** Whose EQ this is: the device's own, the session's shared one, or flat. */
		status?: string;
		/** Whether Reset has anything to undo (the device's own EQ, or a change from flat). */
		canReset?: boolean;
		/** A member: may save the EQ for everyone in the account. */
		canEdit?: boolean;
		/** The settings are the session's shared EQ already (or there is no session to save to). */
		sharedMatches?: boolean;
		/** The session has a shared EQ, which a member may remove. */
		hasShared?: boolean;
		downloadDisabled?: boolean;
		/** The current recording's spectrum is measured, so Auto can fit the EQ to it. */
		canAuto?: boolean;
		onreset?: () => void;
		/** Auto EQ: the player fits the bands to the recording's measured sound. */
		onauto?: () => void;
		onsaveshared?: () => void;
		onremoveshared?: () => void;
		ondownload?: () => void;
	}
	let {
		id,
		settings,
		onchange,
		status = "",
		canReset = false,
		canEdit = false,
		sharedMatches = true,
		hasShared = false,
		downloadDisabled = true,
		canAuto = false,
		onreset,
		onauto,
		onsaveshared,
		onremoveshared,
		ondownload,
	}: Props = $props();

	/** The center slider's travel: steps across the band's range on a log scale, as the ear hears pitch. */
	const STEPS = 200;
	function freqToStep(band: EqBand, hz: number) {
		const { minFreq, maxFreq } = EQ_BAND_SPECS[band];
		return Math.round((STEPS * Math.log(hz / minFreq)) / Math.log(maxFreq / minFreq));
	}
	function stepToFreq(band: EqBand, step: number) {
		const { minFreq, maxFreq } = EQ_BAND_SPECS[band];
		const hz = minFreq * (maxFreq / minFreq) ** (step / STEPS);
		// Round numbers to read: 5 Hz steps below 1 kHz, 50 Hz above.
		const grid = hz < 1000 ? 5 : 50;
		return Math.min(maxFreq, Math.max(minFreq, Math.round(hz / grid) * grid));
	}
	function setGain(band: EqBand, e: Event) {
		const gain = Number((e.currentTarget as HTMLInputElement).value);
		onchange({ ...settings, [band]: { ...settings[band], gain } });
	}
	function setFreq(band: EqBand, e: Event) {
		const freq = stepToFreq(band, Number((e.currentTarget as HTMLInputElement).value));
		onchange({ ...settings, [band]: { ...settings[band], freq } });
	}
	/** A gain as the panel shows it: "+3.5 dB", "0 dB", "−6 dB" (a real minus sign). */
	function formatDb(v: number) {
		return `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v)} dB`;
	}
	/** A center as the panel shows it: "400 Hz", "1.0 kHz", "2.55 kHz". */
	function formatHz(hz: number) {
		if (hz < 1000) return `${hz} Hz`;
		return `${(hz / 1000).toFixed(hz % 100 === 0 ? 1 : 2)} kHz`;
	}
</script>

<!-- The playback EQ's panel: a high-pass for rumble and five bands, per session. -->
<div
	{id}
	popover="auto"
	class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(26rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-4 sm:p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	aria-label="Playback EQ"
>
	<div class="mb-1 flex items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">Playback EQ</h2>
		<button class="button button-xs" type="button" popovertarget={id} popovertargetaction="hide">
			Close
		</button>
	</div>
	{#if status}
		<p class="mb-4 text-sm text-dim" data-testid="eq-status">{status}</p>
	{/if}
	<label class="mb-4 flex items-start gap-3">
		<input
			type="checkbox"
			class="mt-1 accent-maximumYellow"
			checked={settings.highPass}
			onchange={(e) => onchange({ ...settings, highPass: e.currentTarget.checked })}
		/>
		<span>
			High-pass ({EQ_HIGH_PASS_HZ} Hz)
			<span class="block text-sm text-dim">Cuts rumble: stage thumps, wind and handling noise.</span
			>
		</span>
	</label>
	{#each EQ_BANDS as band (band)}
		{@const spec = EQ_BAND_SPECS[band]}
		<div class="mb-3 border-t border-white/10 pt-2">
			<div class="flex items-baseline justify-between gap-2 text-sm">
				<span
					>{spec.label}
					{#if spec.kind !== "peaking"}<span class="text-dim">· shelf</span>{/if}</span
				>
				<span class="tabular-nums" data-testid="eq-{band}-value"
					>{formatDb(settings[band].gain)}</span
				>
			</div>
			<input
				type="range"
				class="w-full accent-maximumYellow"
				min={PLAYBACK_EQ_MIN_DB}
				max={PLAYBACK_EQ_MAX_DB}
				step="0.5"
				value={settings[band].gain}
				oninput={(e) => setGain(band, e)}
				aria-label="{spec.label} gain"
				aria-valuetext={formatDb(settings[band].gain)}
			/>
			<div class="flex items-center gap-2 text-xs text-dim">
				<span aria-hidden="true">Center</span>
				<input
					type="range"
					class="min-w-0 grow accent-blue-300"
					min="0"
					max={STEPS}
					step="1"
					value={freqToStep(band, settings[band].freq)}
					oninput={(e) => setFreq(band, e)}
					aria-label="{spec.label} center"
					aria-valuetext={formatHz(settings[band].freq)}
				/>
				<span class="w-16 text-right tabular-nums" data-testid="eq-{band}-freq"
					>{formatHz(settings[band].freq)}</span
				>
			</div>
		</div>
	{/each}
	<div class="mt-4 flex flex-wrap justify-end gap-2">
		<button
			class="button button-xs"
			type="button"
			disabled={!canAuto}
			onclick={onauto}
			title={canAuto
				? "Set the EQ from this recording's measured sound against a live-mix curve; adjust from there"
				: "Not measured yet"}
		>
			<span class="i-ph-magic-wand" aria-hidden="true"></span>
			Auto
		</button>
		<button class="button button-xs" type="button" disabled={!canReset} onclick={onreset}>
			Reset
		</button>
		<button class="button button-xs" type="button" disabled={downloadDisabled} onclick={ondownload}>
			<span class="i-ph-download-simple" aria-hidden="true"></span>
			Download with EQ
		</button>
		{#if canEdit}
			{#if hasShared}
				<button class="button button-xs" type="button" onclick={onremoveshared}>
					Remove shared EQ
				</button>
			{/if}
			<button
				class="button button-xs"
				type="button"
				disabled={sharedMatches}
				onclick={onsaveshared}
				title="Everyone in the account hears this EQ on the session unless they set their own"
			>
				<span class="i-ph-users-three" aria-hidden="true"></span>
				Save for everyone
			</button>
		{/if}
	</div>
</div>
