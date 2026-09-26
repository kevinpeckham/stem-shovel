<script lang="ts">
	import DrumMachine from "$lib/components/DrumMachine.svelte";
	import InfoTip from "$lib/components/InfoTip.svelte";
</script>

<svelte:head>
	<title>Drum Machine | Free Online Drum Machine</title>
	<meta
		name="description"
		content="A free drum machine in the browser: a step sequencer with an acoustic kit and an electronic kit, tempo, swing, mute and solo per row, and a link that carries your beat to anyone."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
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
	</header>
	<div class="max-w-860px">
		<DrumMachine />
	</div>
	<p class="max-w-article mt-4 text-13px text-dim">
		Rows are drums, columns are sixteenth notes. Space plays and stops. Your beat is remembered in
		this browser; Copy link puts it in the address so it opens the same anywhere. The acoustic kit
		is built from public-domain samples.
	</p>
</main>
