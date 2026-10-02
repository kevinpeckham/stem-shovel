<script lang="ts">
	import { drumMachine } from "$lib/audio/drumMachine.svelte";
	import DrumMachine from "$lib/components/DrumMachine.svelte";
	import DrumTutorial from "$lib/components/DrumTutorial.svelte";
	import PageCopyHeader from "$lib/components/PageCopyHeader.svelte";
	import PageCopySection from "$lib/components/PageCopySection.svelte";
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
	<title>{data.copy.title || "Drum Machine"} | Free Online Drum Machine</title>
	<meta
		name="description"
		content="A free drum machine in the browser: a step sequencer with an acoustic kit and an electronic kit, tempo, swing, mute and solo per row, and a link that carries your beat to anyone."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding max-w-full w-full">
	<PageCopyHeader copy={data.copy}>
		{#snippet controls()}
			{#if !drumTutorial.active}
				<button class="button button-sm" type="button" onclick={startTutorial}>
					<span class="i-ph-graduation-cap" aria-hidden="true"></span>
					Tutorial: a rock beat from scratch
				</button>
			{/if}
		{/snippet}
	</PageCopyHeader>
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
			homeAdmin={data.homeAdmin}
		/>
		<DrumTutorial />
	</div>

	<PageCopySection
		html={data.copy.bodyHtml}
		docsHref="/docs/drum-machine"
		docsLabel="Drum machine docs"
		docsLead="Learn more about using the drum machine in the user docs."
	/>
</main>
