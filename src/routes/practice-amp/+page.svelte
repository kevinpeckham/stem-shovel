<script lang="ts">
	import { amp } from "#lib/audio/amp.svelte.js";
	import { inputSources } from "#lib/audio/inputs.svelte.js";
	import { metronome } from "#lib/audio/metronome.svelte.js";
	import { chordPiano } from "#lib/audio/piano.svelte.js";
	import { chordPlayer } from "#lib/audio/chordPlayer.svelte.js";
	import ChordPlayer from "#lib/components/ChordPlayer.svelte";
	import DrumMachine from "#lib/components/DrumMachine.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import Metronome from "#lib/components/Metronome.svelte";
	import PageCopyHeader from "#lib/components/PageCopyHeader.svelte";
	import PageCopySection from "#lib/components/PageCopySection.svelte";
	import PracticeAmp from "#lib/components/PracticeAmp.svelte";
	import Tuner from "#lib/components/Tuner.svelte";
	import { onDestroy, tick } from "svelte";

	/**
	 * The Practice Amp's page (docs/practice-amp.md): the amp, with the
	 * tuner and the metronome in panels (floating from lg, docked below)
	 * that share its audio. Leaving the page turns the amp off, which
	 * closes the input.
	 */
	let { data } = $props();
	// The dev server only: the engine on the window, so a browser test can read its state and render the chain.
	if (import.meta.env.DEV && typeof window !== "undefined")
		Object.assign(window, {
			__amp: amp,
			__inputs: inputSources,
			__metronome: metronome,
			__chordPiano: chordPiano,
			__chords: chordPlayer,
		});

	let tuner = $state<Tuner | null>(null);
	let tunerOpen = $state(false);
	let metronomeOpen = $state(false);
	/** The drum machine's panel: a beat to play to, in the amp's own context (hosted by the engine), so it shares the output. */
	let drumsOpen = $state(false);
	/** The chord player's panel: the amp's demo input, its dry voices through the chain (docs/practice-amp.md, "Demo through the chord player"). */
	let chordsOpen = $state(false);
	function toggleChords() {
		chordsOpen = !chordsOpen;
		if (!chordsOpen) chordPlayer.allOff();
	}
	async function toggleTuner() {
		tunerOpen = !tunerOpen;
		if (tunerOpen) {
			await tick();
			void tuner?.start();
		} else tuner?.stop();
	}
	onDestroy(() => {
		tuner?.stop();
		void amp.setOn(false);
	});
</script>

<svelte:head>
	<title>{data.copy.title || "Practice Amp"} | Guitar and Bass Amp in the Browser</title>
	<meta
		name="description"
		content="A free guitar and bass practice amp in the browser: plug in directly or through an audio interface, choose a clean or crunchy guitar head or a tube or solid-state bass head, add pedals, and play in headphones or through the speakers."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<PageCopyHeader copy={data.copy} />
	<div class="max-w-full overflow-hidden">
		<PracticeAmp
			{tunerOpen}
			{metronomeOpen}
			ontuner={toggleTuner}
			onmetronome={() => (metronomeOpen = !metronomeOpen)}
			{drumsOpen}
			ondrums={() => (drumsOpen = !drumsOpen)}
			{chordsOpen}
			onchords={toggleChords}
			sitePresets={data.sitePresets}
			account={data.account}
			presets={data.presets}
			presetAdmin={data.presetAdmin}
		/>
	</div>
	<FloatingPanel
		open={tunerOpen}
		title="Tuner"
		storageKey="stemshovel.amp.tuner-panel"
		width={640}
		height={560}
		onminimise={() => void toggleTuner()}
	>
		<div class="p-3">
			<Tuner bind:this={tuner} source={() => amp.inputTap()} />
		</div>
	</FloatingPanel>
	<FloatingPanel
		open={chordsOpen}
		title="Chord player"
		storageKey="stemshovel.amp.chords-panel"
		width={760}
		height={720}
		onminimise={toggleChords}
	>
		<ChordPlayer
			samplesBase={data.pianoSamplesBase}
			keyboard={chordsOpen}
			sitePresets={data.chordPresets}
			account={data.account}
			presets={data.pianoPresets}
			presetAdmin={data.presetAdmin}
			chordStyles={data.chordStyles}
			pad={false}
		/>
	</FloatingPanel>
	<FloatingPanel
		open={drumsOpen}
		title="Drum machine"
		storageKey="stemshovel.amp.drum-panel"
		onminimise={() => (drumsOpen = false)}
	>
		<DrumMachine
			kits={data.kits}
			keyboard={drumsOpen}
			account={data.account}
			beats={data.beats}
			textToBeat={data.textToBeat}
		/>
	</FloatingPanel>
	<FloatingPanel
		open={metronomeOpen}
		title="Metronome"
		storageKey="stemshovel.amp.metronome-panel"
		width={640}
		height={520}
		onminimise={() => (metronomeOpen = false)}
	>
		<Metronome />
	</FloatingPanel>
	<PageCopySection
		html={data.copy.bodyHtml}
		docsHref="/docs/practice-amp"
		docsLabel="Practice Amp docs"
	/>
</main>
