<script lang="ts">
	import type { ExportFile, ExportOptions } from "#lib/audio/studioExport.js";
	import { EXPORT_DEFAULTS } from "#lib/audio/studioExport.js";
	import { LOUDNESS_TARGET_LUFS, TRUE_PEAK_CEILING_DBTP } from "#lib/constants/loudness.js";

	/**
	 * The export panel (docs/dawn-daw-plan.md, D3): what to render (the
	 * mix, a stem per track, a stem per bus, a DAWproject, a session bundle
	 * for the DAWs without one, a Sandyne project; docs/daw-interop-plan.md),
	 * how (24- or
	 * 16-bit WAV, normalized to the streaming target or as mixed), and
	 * whether the files come as one zip. The caller renders (`onexport`)
	 * and hands back what it made, shown with each file's loudness. The
	 * choices stay for the page's life.
	 */
	interface Props {
		trackCount: number;
		busCount: number;
		/** Rendering now: the controls lock and the step shows. */
		busy: boolean;
		step?: string | null;
		results?: ExportFile[];
		onexport: (options: ExportOptions, zip: boolean) => void;
	}
	let { trackCount, busCount, busy, step = null, results = [], onexport }: Props = $props();

	let options = $state<ExportOptions>({ ...EXPORT_DEFAULTS });
	let zip = $state(true);
	const chosen = $derived(
		[
			options.mix,
			options.tracks && trackCount > 0,
			options.buses && busCount > 0,
			options.dawproject,
			options.bundle,
			options.sandyne,
		].filter(Boolean).length,
	);
	const kb = (bytes: number) =>
		bytes >= 1024 * 1024
			? `${(bytes / 1024 / 1024).toFixed(1)} MB`
			: `${Math.round(bytes / 1024)} KB`;
	/** One line on a file: its size, then its loudness and true peak and the gain applied when it is audio. */
	function summary(f: ExportFile): string {
		const parts = [kb(f.blob.size)];
		// The file as written: the measurement plus the gain applied, with what it measured before.
		if (f.loudness) {
			const { integrated, truePeak } = f.loudness;
			const gain = f.gainDb ?? 0;
			if (integrated === null || !Number.isFinite(integrated)) parts.push("silent");
			else {
				parts.push(`${(integrated + gain).toFixed(1)} LUFS`);
				if (Number.isFinite(truePeak)) parts.push(`${(truePeak + gain).toFixed(1)} dBTP`);
			}
			if (gain && integrated !== null)
				parts.push(`${gain > 0 ? "+" : ""}${gain} dB applied (was ${integrated.toFixed(1)} LUFS)`);
		}
		return parts.join(" · ");
	}
</script>

<div class="grid gap-4 text-13px" data-export-panel>
	<fieldset class="grid gap-1.5" disabled={busy}>
		<legend class="mb-1 text-11px uppercase tracking-wide opacity-70">What</legend>
		<label class="flex items-center gap-2 text-blue-100/90">
			<input type="checkbox" class="accent-maximumYellow" bind:checked={options.mix} />
			The mix: every track, bus and the master as they stand
		</label>
		<label class="flex items-center gap-2 text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				bind:checked={options.tracks}
				disabled={trackCount === 0}
			/>
			A stem per track ({trackCount}), each with its own fader, pan and inserts
		</label>
		<label class="flex items-center gap-2 text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				bind:checked={options.buses}
				disabled={busCount === 0}
			/>
			A stem per bus ({busCount}), with what feeds it
		</label>
		<label class="flex items-center gap-2 text-blue-100/90">
			<input type="checkbox" class="accent-maximumYellow" bind:checked={options.dawproject} />
			A DAWproject (.dawproject) for Bitwig, Cubase or Studio One: the tracks, clips, fades, levels and
			automation with the recordings
		</label>
		<label class="flex items-center gap-2 text-blue-100/90">
			<input type="checkbox" class="accent-maximumYellow" bind:checked={options.bundle} />
			A session bundle for Logic, Pro Tools, Ableton Live, Audacity or Reaper: every clip as a Broadcast
			WAV stamped with its position, a stem per track from zero, a MIDI file with the tempo map, meters,
			key, markers and the MIDI parts, and Audacity labels, with a README
		</label>
		<label class="flex items-center gap-2 text-blue-100/90">
			<input type="checkbox" class="accent-maximumYellow" bind:checked={options.sandyne} />
			A Sandyne project (.sand) with its samples, for the free Sandyne DAW: the tracks, clips, fades,
			levels and the MIDI parts' notes
		</label>
		<label class="ml-6 flex items-center gap-2 text-blue-100/90">
			<input
				type="checkbox"
				class="accent-maximumYellow"
				bind:checked={options.trim}
				disabled={!options.dawproject && !options.sandyne}
			/>
			Trim the project files' recordings to what plays: one file per clip, nothing a clip skips
		</label>
	</fieldset>
	<fieldset class="grid gap-1.5" disabled={busy}>
		<legend class="mb-1 text-11px uppercase tracking-wide opacity-70">How</legend>
		<div class="flex flex-wrap items-center gap-3" role="radiogroup" aria-label="Format">
			<label class="flex items-center gap-2 text-blue-100/90">
				<input
					type="radio"
					class="accent-maximumYellow"
					name="bits"
					value={24}
					checked={options.format === "wav" && options.bits === 24}
					onchange={() => {
						options.format = "wav";
						options.bits = 24;
					}}
				/>
				24-bit WAV
			</label>
			<label class="flex items-center gap-2 text-blue-100/90">
				<input
					type="radio"
					class="accent-maximumYellow"
					name="bits"
					value={16}
					checked={options.format === "wav" && options.bits === 16}
					onchange={() => {
						options.format = "wav";
						options.bits = 16;
					}}
				/>
				16-bit WAV
			</label>
			<!-- Encoded in the browser (audio/encodeMp3.ts): the DAWproject's audio stays WAV. -->
			<label class="flex items-center gap-2 text-blue-100/90">
				<input
					type="radio"
					class="accent-maximumYellow"
					name="bits"
					value="mp3"
					checked={options.format === "mp3"}
					onchange={() => (options.format = "mp3")}
				/>
				MP3 (192 kbps)
			</label>
		</div>
		<label class="flex items-center gap-2 text-blue-100/90">
			<input type="checkbox" class="accent-maximumYellow" bind:checked={options.normalize} />
			Normalize to {LOUDNESS_TARGET_LUFS} LUFS with peaks under {TRUE_PEAK_CEILING_DBTP} dBTP (the streaming
			services' level)
		</label>
		<label class="flex items-center gap-2 text-blue-100/90">
			<input type="checkbox" class="accent-maximumYellow" bind:checked={zip} />
			One zip rather than a download per file
		</label>
	</fieldset>
	<div class="flex items-center gap-3">
		<button
			class="button button-sm"
			type="button"
			disabled={busy || chosen === 0}
			onclick={() => onexport($state.snapshot(options), zip)}
		>
			<span class="i-ph-export" aria-hidden="true"></span>
			{busy ? "Exporting…" : "Export"}
		</button>
		{#if busy && step}
			<span class="text-12px opacity-80" aria-live="polite">{step}</span>
		{/if}
	</div>
	{#if results.length}
		<ul class="grid gap-1 text-12px" aria-label="Exported files">
			{#each results as f (f.name)}
				<li class="flex flex-wrap items-baseline gap-x-2">
					<span class="font-500">{f.name}</span>
					<span class="opacity-70">{summary(f)}</span>
				</li>
			{/each}
		</ul>
	{/if}
</div>
