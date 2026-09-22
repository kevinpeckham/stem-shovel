<script lang="ts">
	import Tuner from "$lib/components/Tuner.svelte";
	import { pageTitle } from "$lib/utils/pageTitle";
	import InfoTip from "$lib/components/InfoTip.svelte";
</script>

<svelte:head>
	<title>{pageTitle("Tuner")}</title>
	<meta
		name="description"
		content="A free chromatic tuner in the browser: guitar, bass and ukulele tunings, a reference pitch you can set, and a needle that reads to the cent. Nothing is recorded."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<header class="mb-8 max-w-prose">
		<div class="flex items-baseline gap-2 mb-5">
			<h1 class="app-page-heading">Tuner</h1>
			<InfoTip class="sm-hidden" text="Free chromatic tuner that works in your browser. Preset tunings for guitar, bass and ukulele." />
		</div>
		<p class="app-page-subheading hidden sm-block text-balance">
			Free chromatic tuner that works in your browser. Preset tunings for guitar, bass and ukulele.
		</p>
	</header>
	<div class="max-w-article">
		<Tuner />
	</div>
</main>
