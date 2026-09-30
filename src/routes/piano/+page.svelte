<script lang="ts">
	import InfoTip from "$lib/components/InfoTip.svelte";
	import Piano from "$lib/components/Piano.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>Piano | Free Online Piano and Synth</title>
	<meta
		name="description"
		content="A free piano and synth in the browser: play the keys with the mouse, a touch screen, the computer keyboard or a MIDI controller, with an Electric Piano, an Organ, a Synth Lead, a Pad and a Pluck."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<header class="mb-8 max-w-prose sr-only sm-block">
		<div class="flex items-baseline gap-2 mb-5">
			<h1 class="app-page-heading">Piano</h1>
			<InfoTip
				class="sm-hidden"
				text="A piano and synth in your browser: play it from the screen, the computer keyboard or a MIDI controller."
			/>
		</div>
		<p class="app-page-subheading hidden sm-block text-balance">
			A piano and synth in your browser: play it from the screen, the computer keyboard or a MIDI
			controller.
		</p>
	</header>
	<Piano warm samplesBase={data.samplesBase} />
	<section class="mt-8 max-w-article [&>_p]-(mt-3 text-15px opacity-90)">
		<h2 class="heading-2">How to play</h2>
		<p>
			Tap or click the keys; slide across them for a run; on a touch screen, several fingers play
			several notes. The lower on a key you press, the louder the note.
		</p>
		<p>
			On the computer keyboard the bottom row plays the first octave, from <kbd>Z</kbd> on the white
			keys with the sharps on the row above (<kbd>S</kbd>, <kbd>D</kbd>, <kbd>G</kbd>…), and the row
			from <kbd>Q</kbd> plays the octave above it. The arrow keys move the keyboard an octave up or
			down, the space bar is the sustain pedal, and <kbd>Esc</kbd> stops everything.
		</p>
		<p>
			With a MIDI keyboard plugged in, <strong>Connect MIDI</strong> lets it play the piano, its velocity
			and sustain pedal included (Chrome and Edge; the browser asks once).
		</p>
	</section>
</main>
