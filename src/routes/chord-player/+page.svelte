<script lang="ts">
	import { onMount } from "svelte";
	import { chordPlayer } from "#lib/audio/chordPlayer.svelte.js";
	import { chordPiano } from "#lib/audio/piano.svelte.js";
	import { progressionPad } from "#lib/audio/progression.svelte.js";
	import ChordPlayer from "#lib/components/ChordPlayer.svelte";
	import FloatingPanel from "#lib/components/FloatingPanel.svelte";
	import PageCopyHeader from "#lib/components/PageCopyHeader.svelte";
	import PageCopySection from "#lib/components/PageCopySection.svelte";
	import ProgressionNotesPanel from "#lib/components/ProgressionNotesPanel.svelte";
	import type { SavedProgression } from "#lib/val/ProgressionSchema.js";
	import { decodeChordShare } from "#lib/utils/decodeChordShare.js";
	import { metronome } from "#lib/audio/metronome.svelte.js";
	import { notify } from "#lib/state/notifications.svelte.js";

	let { data } = $props();

	// Dev only: the engines on window for the browser scripts in .screenshots/ (docs/agent-screenshots.md).
	if (import.meta.env.DEV && typeof window !== "undefined")
		Object.assign(window, {
			__chords: chordPlayer,
			__piano: chordPiano,
			__pad: progressionPad,
			__metronome: metronome,
		});

	/** The saved progressions as the page holds them: the pad's Saved menu and the notes panel share the list. */
	// svelte-ignore state_referenced_locally
	let saved = $state<SavedProgression[]>(data.progressions);

	// The device and its notes pop out into panels from lg, as the looper's do (Kevin); remembered per browser.
	let deviceFloating = $state(false);
	let notesFloating = $state(false);
	const DEVICE_FLOATING_KEY = "stemshovel.chord-player.device-floating";
	const NOTES_FLOATING_KEY = "stemshovel.chord-player.notes-floating";
	function remember(key: string, on: boolean) {
		try {
			localStorage.setItem(key, on ? "1" : "0");
		} catch {
			// Private mode: the choice lasts for this page only.
		}
	}
	function setDeviceFloating(on: boolean) {
		deviceFloating = on;
		remember(DEVICE_FLOATING_KEY, on);
	}
	function setNotesFloating(on: boolean) {
		notesFloating = on;
		remember(NOTES_FLOATING_KEY, on);
	}
	onMount(() => {
		try {
			deviceFloating = localStorage.getItem(DEVICE_FLOATING_KEY) === "1";
			notesFloating = localStorage.getItem(NOTES_FLOATING_KEY) === "1";
		} catch {
			// As above.
		}
		// A share link (docs/chord-player.md, "Share links"): its settings over the remembered ones, as the drum machine's.
		const hash = window.location.hash.slice(1);
		const shared = hash ? decodeChordShare(hash) : null;
		if (shared) {
			chordPiano.load();
			chordPiano.applyPreset(shared.piano);
			chordPlayer.applyPresetSettings(shared.chords);
			chordPlayer.applyUiSettings(shared.ui);
			if (shared.bpm) metronome.setBpm(shared.bpm);
			notify("Set up from the link");
		} else if (hash) notify("That link did not hold chord player settings", { kind: "error" });
	});
	function clearNotes() {
		progressionPad.setNotes("");
		progressionPad.notesKey++;
	}
	const notesTitle = $derived(
		`Notes for “${progressionPad.name || (progressionPad.savedId ? "this progression" : "a new progression")}”`,
	);
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
	<!-- The device in a docked panel with a pop-out from lg, as the looper's. -->
	<FloatingPanel
		open={true}
		floating={deviceFloating}
		closable={false}
		title="Chord Player"
		storageKey="stemshovel.chord-player.device-panel"
		width={720}
		height={960}
		onminimise={() => setDeviceFloating(false)}
	>
		{#snippet controls()}
			<button
				class="button button-xs hidden lg-inline-flex"
				type="button"
				title={deviceFloating
					? "Put the chord player back in the page"
					: "Pop the chord player out into a panel"}
				aria-label={deviceFloating ? "Dock the chord player" : "Pop out the chord player"}
				onclick={() => setDeviceFloating(!deviceFloating)}
			>
				<span
					class={deviceFloating ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
					aria-hidden="true"
				></span>
			</button>
		{/snippet}
		<ChordPlayer
			warm
			samplesBase={data.samplesBase}
			sitePresets={data.sitePresets}
			account={data.account}
			presets={data.presets}
			presetAdmin={data.presetAdmin}
			chordStyles={data.chordStyles}
			textToChords={data.textToChords}
			bind:savedProgressions={saved}
		/>
	</FloatingPanel>

	{#if data.account}
		<!-- The progression's notes: the recorder's panel, kept with the pad and saved with the progression (made on the first note when the pad was never saved). -->
		<section class="mt-6" aria-label="Progression notes">
			<FloatingPanel
				open={true}
				floating={notesFloating}
				closable={false}
				title={notesTitle}
				storageKey="stemshovel.chord-player.notes-panel"
				width={560}
				height={620}
				onminimise={() => setNotesFloating(false)}
			>
				{#snippet controls()}
					<button
						class="button button-xs hidden lg-inline-flex"
						type="button"
						title={notesFloating
							? "Put the notes back in the page"
							: "Pop the notes out into a panel"}
						aria-label={notesFloating ? "Dock the notes" : "Pop out the notes"}
						onclick={() => setNotesFloating(!notesFloating)}
					>
						<span
							class={notesFloating ? "i-ph-arrows-in-simple" : "i-ph-arrows-out-simple"}
							aria-hidden="true"
						></span>
					</button>
					<button
						class="button button-xs"
						type="button"
						title="Clear the notes"
						aria-label="Clear the notes"
						onclick={() => {
							if (confirm("Clear the notes?")) clearNotes();
						}}
					>
						<span class="i-ph-trash" aria-hidden="true"></span>
					</button>
				{/snippet}
				<ProgressionNotesPanel
					account={data.account}
					onrow={(change) => {
						if (change.kind === "deleted") saved = saved.filter((p) => p.id !== change.id);
						else
							saved = [
								{
									...change.row,
									data: $state.snapshot(progressionPad.data),
									notes: progressionPad.notes,
								},
								...saved,
							];
					}}
				/>
			</FloatingPanel>
		</section>
	{/if}

	<PageCopySection
		html={data.copy.bodyHtml}
		docsHref="/docs/chord-player"
		docsLabel="Chord Player docs"
		docsLead="Learn more about using the chord player in the user docs."
	/>
</main>
