<script lang="ts">
	import ChordPlayer from "$lib/components/ChordPlayer.svelte";
	import PageCopyHeader from "$lib/components/PageCopyHeader.svelte";
	import PageCopySection from "$lib/components/PageCopySection.svelte";
	import { chordPlayer } from "$lib/audio/chordPlayer.svelte";
	import { piano } from "$lib/audio/piano.svelte";

	let { data } = $props();

	// Dev only: the engines on window for the browser scripts in .screenshots/ (docs/agent-screenshots.md).
	if (import.meta.env.DEV && typeof window !== "undefined")
		Object.assign(window, { __chords: chordPlayer, __piano: piano });
</script>

<svelte:head>
	<title>{data.copy.title || "Chord Player"} | Free Online Circle of Fifths Chord Player</title>
	<meta
		name="description"
		content="A free chord player in the browser: press the chords of the circle of fifths and hear them on a grand piano, an electric piano, an organ or a synth, with effects, by mouse, touch or the computer keyboard. Helpful for songwriters working out a progression."
	/>
</svelte:head>

<main class="page-x-padding main-y-padding">
	<!-- The header is for screen readers only on a phone, where the circle wants the room. -->
	<div class="lt-sm-sr-only">
		<PageCopyHeader copy={data.copy} />
	</div>
	<ChordPlayer
		warm
		samplesBase={data.samplesBase}
		sitePresets={data.sitePresets}
		account={data.account}
		presets={data.presets}
	/>
	<PageCopySection
		html={data.copy.bodyHtml}
		docsHref="/docs/chord-player"
		docsLabel="Chord Player docs"
		docsLead="Learn more about using the chord player in the user docs."
	/>
</main>
