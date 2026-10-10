<script lang="ts">
	import { amp } from "#lib/audio/amp.svelte.js";
	import { inputSources } from "#lib/audio/inputs.svelte.js";
	import { metronome } from "#lib/audio/metronome.svelte.js";
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
		Object.assign(window, { __amp: amp, __inputs: inputSources, __metronome: metronome });

	let tuner = $state<Tuner | null>(null);
	let tunerOpen = $state(false);
	let metronomeOpen = $state(false);
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
	<div class="max-w-5xl">
		<PracticeAmp
			{tunerOpen}
			{metronomeOpen}
			ontuner={toggleTuner}
			onmetronome={() => (metronomeOpen = !metronomeOpen)}
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
