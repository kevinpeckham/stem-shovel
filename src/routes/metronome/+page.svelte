<script lang="ts">
	import Metronome from "$lib/components/Metronome.svelte";
	import InfoTip from "$lib/components/InfoTip.svelte";
</script>

<svelte:head>
	<title>Metronome | Free Online Metronome</title>
	<meta
		name="description"
		content="A free metronome in the browser: 30 to 300 beats per minute, tap tempo, two to six beats to the bar with an accented first beat, and a click that keeps time from the audio clock."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<header class="mb-8 max-w-prose">
		<div class="flex items-baseline gap-2 mb-5">
			<h1 class="app-page-heading">Metronome</h1>
			<InfoTip
				class="sm-hidden"
				text="Free metronome that works in your browser. Tap the tempo, pick the beats to the bar, and go."
			/>
		</div>
		<p class="app-page-subheading hidden sm-block text-balance">
			Free metronome that works in your browser. Tap the tempo, pick the beats to the bar, and go.
		</p>
	</header>
	<div class="max-w-article">
		<Metronome />
	</div>
	<p class="max-w-article mt-4 text-13px text-dim">
		The same metronome sits in the Idea Recorder's toolbar, a tap away from Record.
	</p>
</main>
