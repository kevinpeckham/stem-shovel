<script lang="ts">
	import PageCopyHeader from "$lib/components/PageCopyHeader.svelte";
	import PageCopySection from "$lib/components/PageCopySection.svelte";
	import Piano from "$lib/components/Piano.svelte";

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.copy.title || "Piano"} | Free Online Piano and Synth</title>
	<meta
		name="description"
		content="A free piano and synth in the browser: play the keys with the mouse, a touch screen, the computer keyboard or a MIDI controller, with an Electric Piano, an Organ, a Synth Lead, a Pad and a Pluck."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<!-- The header is for screen readers only on a phone, where the keys want the room. -->
	<div class="lt-sm-sr-only">
		<PageCopyHeader copy={data.copy} />
	</div>
	<Piano
		warm
		samplesBase={data.samplesBase}
		sitePresets={data.sitePresets}
		account={data.account}
		presets={data.presets}
		presetAdmin={data.presetAdmin}
		metronome
	/>
	<PageCopySection
		html={data.copy.bodyHtml}
		docsHref="/docs/piano"
		docsLabel="Piano docs"
		docsLead="Learn more about using the piano in the user docs."
	/>
</main>
