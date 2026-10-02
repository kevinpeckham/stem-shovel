<script lang="ts">
	import PageCopyHeader from "$lib/components/PageCopyHeader.svelte";
	import PageCopySection from "$lib/components/PageCopySection.svelte";
	import Tuner from "$lib/components/Tuner.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.copy.title || "Tuner"} | Chromatic Instrument Tuner</title>
	<meta
		name="description"
		content="A free chromatic tuner in the browser: guitar, bass and ukulele tunings, a reference pitch you can set, and a needle that reads to the cent. Nothing is recorded."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<PageCopyHeader copy={data.copy} />
	<div class="max-w-article">
		<Tuner startOnHover />
	</div>
	<PageCopySection
		html={data.copy.bodyHtml}
		docsHref="/docs/idea-recorder"
		docsLabel="Idea Recorder docs"
		docsLead="The tuner is described in the Idea Recorder's user docs."
	/>
</main>
