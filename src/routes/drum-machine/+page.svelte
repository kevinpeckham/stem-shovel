<script lang="ts">
	import { drumMachine } from "$lib/audio/drumMachine.svelte";
	import DrumMachine from "$lib/components/DrumMachine.svelte";
	import DrumTutorial from "$lib/components/DrumTutorial.svelte";
	import InfoTip from "$lib/components/InfoTip.svelte";
	import { TUTORIAL_PROJECT } from "$lib/constants/drumTutorial";
	import { drumTutorial } from "$lib/state/drumTutorial.svelte";

	let { data } = $props();

	/** The walk-through: an empty kit in place of the project (the machine's Undo brings the project back), then the panel. */
	function startTutorial() {
		if (drumMachine.running) drumMachine.stop();
		drumMachine.loadProject(structuredClone(TUTORIAL_PROJECT), "replace");
		drumTutorial.start();
	}
</script>

<svelte:head>
	<title>Drum Machine | Free Online Drum Machine</title>
	<meta
		name="description"
		content="A free drum machine in the browser: a step sequencer with an acoustic kit and an electronic kit, tempo, swing, mute and solo per row, and a link that carries your beat to anyone."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding max-w-full w-full">
	<header class="mb-8 max-w-prose">
		<div class="flex items-baseline gap-2 mb-5">
			<h1 class="app-page-heading">Drum Machine</h1>
			<InfoTip
				class="sm-hidden"
				text="Free drum machine that works in your browser. Tap the cells to build a beat, press Play, and copy a link to share it."
			/>
		</div>
		<p class="app-page-subheading hidden sm-block text-balance">
			Free drum machine that works in your browser. Tap the cells to build a beat, press Play, and
			copy a link to share it.
		</p>
		{#if !drumTutorial.active}
			<button class="button button-sm mt-4" type="button" onclick={startTutorial}>
				<span class="i-ph-graduation-cap" aria-hidden="true"></span>
				Tutorial: a rock beat from scratch
			</button>
		{/if}
	</header>
	<div class="w-1200px max-w-full w-full">
		{#if data.song}
			<p class="mb-3 text-14px opacity-80">
				A beat for <a class="link" href={data.song.href}>{data.song.title}</a>{data.song.bpm
					? `, at its ${data.song.bpm} bpm`
					: ""}. Save keeps it with the song; the ⋯ menu can add it to the song as a demo.
			</p>
		{/if}
		<DrumMachine
			account={data.account}
			beats={data.beats}
			song={data.song}
			textToBeat={data.textToBeat}
		/>
		<DrumTutorial />
	</div>

	<section
		class="mt-8 [&>_p]-(max-w-article mt-4 text-16px opacity-90) rounded-md border px-5 pt-6 pb-7"
	>
		<h2 class="font-600">How to use the Drum Machine</h2>
		<p>
			Each row on the grid is a different drum. Each column represents a 16th note. Light up a
			square by pressing the grid button to play a beat at that point in time. Then press the play
			button to start the loop and hear your beat played back.
		</p>
		<h3 class="font-600 mb-3 mt-5">Quick Tips</h3>
		<ul class="list-disc pl-4 opacity-90 grid grid-cols-1 gap-y-2">
			<li>To get started quickly select one of the Presets beats from the menu.</li>
			<li>Try the tutorial to learn how to make your own beats.</li>
			<li>Use the tap tempo button to set your tempo.</li>
			<li>Use the space bar to start and stop the drum machine.</li>
			<li>If you are signed into your account you can save and share beats.</li>
		</ul>
		<p></p>
	</section>
</main>
