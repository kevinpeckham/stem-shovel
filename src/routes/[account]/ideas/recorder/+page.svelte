<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import DemoRecorder from "$lib/components/DemoRecorder.svelte";
	import RecordingActions from "$lib/components/RecordingActions.svelte";
	import IdeaNotesPanel from "$lib/components/IdeaNotesPanel.svelte";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
	/** The recording just saved, until the next one starts. */
	let saved = $state<{ id: string; title: string } | null>(null);
	/** Bumped for a fresh recorder and notes after a save. */
	let round = $state(0);
	/** Notes jotted before the take is saved (chords, a title, where it might go); stored with it. */
	let notesDraft = $state("");
</script>

<svelte:head>
	<title>{pageTitle("Idea Recorder")}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article flex flex-wrap items-start justify-between gap-4">
		<div>
			<h1 class="heading-2">Idea Recorder</h1>
			<p class="opacity-90 text-balance">
				A riff, a lick, a melody idea or a whole take. Recordings go to
				<a class="link-dim" href="/{data.account.slug}/ideas/recordings">your recordings</a>; add
				one to a song to make it a demo.
				{#if data.fromSong}
					Opened from <a class="link-dim" href={data.fromSong.href}>{data.fromSong.title}</a>.
				{/if}
			</p>
		</div>
		<a class="button button-sm" href="/{data.account.slug}/ideas/recordings">
			<span class="i-ph-waveform" aria-hidden="true"></span>
			All recordings
		</a>
	</header>

	<!-- Like the song page: the recorder where the player is, the notes where the documents are. -->
	<div class="grid grid-cols-1 gap-8 xl-grid-cols-2">
		<section class="grid gap-6 place-content-start" aria-label="Recorder">
			{#key round}
				<DemoRecorder
					accountId={data.account.id}
					getNotes={() => notesDraft}
					onsaved={(r) => {
						saved = r;
						notify(`Saved “${r.title}” to your recordings`);
					}}
				/>
			{/key}

			{#if saved}
				<div class="surface grid gap-5 px-5 py-5" aria-label="Saved recording">
					<div class="flex flex-wrap items-baseline justify-between gap-3">
						<h2 class="heading-2 mb-0">Saved: {saved.title}</h2>
						<button
							class="link-dim text-sm"
							type="button"
							onclick={() => {
								saved = null;
								notesDraft = "";
								round++;
							}}>Record another</button
						>
					</div>
					<p class="text-sm opacity-90">
						It is in <a class="link-dim" href="/{data.account.slug}/ideas/recordings"
							>your recordings</a
						>
						either way, notes included. To make it a demo:
					</p>
					<RecordingActions recording={saved} projects={data.projects} fromSong={data.fromSong} />
				</div>
			{/if}

			<p class="text-13px opacity-70">
				Tips: keep the screen on and the app in front while recording (a phone stops the microphone
				when it sleeps or switches apps). Voice processing is switched off so instruments sound like
				themselves. The take is saved as your browser recorded it and converted to MP3 for playback.
			</p>
		</section>

		<!-- Notes are open from the start: chords, a working title, where the idea might go. -->
		<section class="min-h-560px" aria-label="Notes">
			{#key round}
				<IdeaNotesPanel
					recording={{ id: saved?.id ?? null, notes: notesDraft }}
					ondraft={(m) => (notesDraft = m)}
				/>
			{/key}
		</section>
	</div>
</main>
