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
	<Piano
		warm
		samplesBase={data.samplesBase}
		sitePresets={data.sitePresets}
		account={data.account}
		presets={data.presets}
		presetAdmin={data.presetAdmin}
		metronome
	/>
	<section
		class="mt-8 max-w-article [&>_p]-(mt-2 text-15px opacity-90) [&>h3]-(font-600 text-1.05em mt-4 leading-tight)"
	>
		<h2 class="heading-2">How to Play</h2>
		<p>
			The SS Keys is designed as an intuitive and easy-to-play online piano / synth. It's never
			going to be as fun as sitting at a real piano or analog synth keyboard, but you might find it
			useful to bang out a melody or experiment with a chord progression. Also, there are some fun
			built-in effects (you haven't lived until you've tried grand piano with fuzz distortion).
			There are some helpful tips below, or just start playing.
		</p>

		<h3>The Basics</h3>
		<p>
			Tap or click the keys to play music. Touch screens will enable you to play chords. Or you can
			play with the keys on a computer keyboard (more on that below). The lower on a key you press,
			the louder the note.
		</p>

		<h3>Instruments, Octaves & Effects</h3>
		<p>
			Use the Sound menu to select an instrument voice. Use the octave controls to reach higher and
			lower notes on the keyboard. Use the effects menu to apply effects such as reverb, delay,
			chorus, phaser, or fuzz distortion.
		</p>

		<h3>Playing on the Computer Keyboard</h3>
		<p>
			You can play the piano by pressing keys on your computer keyboard. Toggle on the key labels by
			pressing the button that has a keyboard icon on it.
		</p>
		<p>
			On the computer keyboard the bottom row plays the first octave, from <kbd>Z</kbd> on the white
			keys with the sharps on the row above (<kbd>S</kbd>, <kbd>D</kbd>, <kbd>G</kbd>…), and the row
			from <kbd>Q</kbd> plays the octave above it. The arrow keys move the keyboard an octave up or
			down, the space bar is the sustain pedal, and <kbd>ESC</kbd> stops everything.
		</p>

		<h3>A Note on Latency</h3>
		<p>
			Bluetooth headphones and speakers add a lot of delay between a key and its sound, often a
			tenth of a second or more. For the best playing experience use your device's built-in speakers
			or wired headphones.
		</p>

		<h3>MIDI</h3>
		<p>
			With a MIDI keyboard plugged in, the MIDI button <span
				class="rounded inline-block w-6 i-ph-usb"
				aria-hidden="true"
			></span> lets it play the piano, including its velocity and sustain pedal. Unfortunately Web MIDI
			is currently supported only on Chrome, Edge and other Chromium browsers.
		</p>

		<div class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2">
			<span class="text-15px opacity-90">Learn more about using the piano in the user docs.</span>
			<a class="button button-sm" href="/docs/piano">
				<span class="i-ph-book-open" aria-hidden="true"></span>
				Piano docs
				<span class="i-ph-arrow-right" aria-hidden="true"></span>
			</a>
		</div>
	</section>
</main>
