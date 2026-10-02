<script lang="ts">
	import Metronome from "$lib/components/Metronome.svelte";
	import PageCopyHeader from "$lib/components/PageCopyHeader.svelte";
	import PageCopySection from "$lib/components/PageCopySection.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.copy.title || "Metronome"} | Free Online Metronome</title>
	<meta
		name="description"
		content="A free metronome in the browser: 30 to 300 beats per minute, tap tempo, two to six beats to the bar with an accented first beat, and a click that keeps time from the audio clock."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<PageCopyHeader copy={data.copy} />
	<div class="max-w-article">
		<Metronome />
	</div>
	<PageCopySection
		html={data.copy.bodyHtml}
		docsHref="/docs/idea-recorder"
		docsLabel="Idea Recorder docs"
		docsLead="The metronome is described in the Idea Recorder's user docs."
	/>
</main>
