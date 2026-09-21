<script lang="ts">
	import Tuner from "$lib/components/Tuner.svelte";
	import { pageTitle } from "$lib/utils/pageTitle";
</script>

<svelte:head>
	<title>{pageTitle("Tuner")}</title>
	<meta
		name="description"
		content="A free chromatic tuner in the browser: guitar, bass and ukulele tunings, a reference pitch you can set, and a needle that reads to the cent. Nothing is recorded."
	/>
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<h1 class="heading-2">Tuner</h1>
		<p class="opacity-90 text-balance">
			Plug in or play near the microphone. The nearest note, how far off it is, and which string it
			is in the tuning you pick. Nothing is recorded or sent anywhere; the sound stays in your
			browser.
		</p>
	</header>
	<div class="max-w-article surface px-5 py-5">
		<Tuner />
	</div>
	<p class="max-w-article mt-4 text-13px text-dim">
		The same tuner sits in the Idea Recorder, a tap away from Record.
	</p>
</main>
