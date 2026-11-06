<script lang="ts">
	import type { ComponentProps } from "svelte";
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import PracticeAmp from "#lib/components/PracticeAmp.svelte";
	import type { SongAmp } from "#lib/state/songAmp.svelte.js";

	type AmpProps = ComponentProps<typeof PracticeAmp>;
	interface Props {
		/** The panel's state and the play-along transport. */
		amp: SongAmp;
		/** The Stem Player's engine: the transport's buttons wait for it to be ready. */
		engine: StemEngine | null;
		sitePresets: AmpProps["sitePresets"];
		account: AmpProps["account"];
		presets: AmpProps["presets"];
		presetAdmin: AmpProps["presetAdmin"];
	}
	let { amp, engine, sitePresets, account, presets, presetAdmin }: Props = $props();
</script>

<div class="{amp.open ? '' : 'hidden'} max-w-full lg:contents">
	<FloatingPanel
		open={amp.open}
		title="Practice amp"
		storageKey="stemshovel.song.amp-panel"
		width={900}
		height={600}
		onminimise={() => (amp.open = false)}
	>
		{#snippet controls()}
			<!-- The play-along transport: the stems, with a count-in from the metronome. -->
			<div class="flex items-center gap-1 text-12px" role="group" aria-label="Play along">
				<button
					class="button button-xs flex items-center gap-1"
					type="button"
					disabled={!engine || engine.status !== "ready"}
					title={engine?.playing ? "Pause the song" : "Play the song along with the amp"}
					aria-label={engine?.playing || amp.countingIn ? "Pause the song" : "Play the song"}
					onclick={() => (engine?.playing || amp.countingIn ? amp.stop() : void amp.play(false))}
				>
					<span
						class={amp.countingIn ? "i-ph-metronome" : engine?.playing ? "i-ph-pause" : "i-ph-play"}
						aria-hidden="true"
					></span>
					{amp.countingIn ? "Count-in…" : engine?.playing ? "Pause" : "Play"}
				</button>
				<button
					class="button button-xs flex items-center"
					type="button"
					disabled={!engine || engine.status !== "ready"}
					title="From the top, with the count-in"
					aria-label="Play the song from the top"
					onclick={() => void amp.play(true)}
				>
					<span class="i-ph-skip-back" aria-hidden="true"></span>
				</button>
				<label class="flex items-center gap-1 px-1" title="A bar of clicks before the song starts">
					<input type="checkbox" class="accent-maximumYellow" bind:checked={amp.countIn} />
					Count in
				</label>
			</div>
		{/snippet}
		<div class="p-2">
			<PracticeAmp {sitePresets} {account} {presets} {presetAdmin} />
		</div>
	</FloatingPanel>
</div>
