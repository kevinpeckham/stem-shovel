<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import DemoRecorder from "$lib/components/DemoRecorder.svelte";
	import RecordingActions from "$lib/components/RecordingActions.svelte";
	import RecordingNotes from "$lib/components/RecordingNotes.svelte";
	import { notify } from "$lib/state/notifications.svelte";

	let { data } = $props();
	/** The recording just saved, until the next one starts. */
	let saved = $state<{ id: string; title: string } | null>(null);
	/** Bumped for a fresh recorder after a save. */
	let round = $state(0);
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

	<section class="max-w-article" aria-label="Recorder">
		{#key round}
			<DemoRecorder
				accountId={data.account.id}
				onsaved={(r) => {
					saved = r;
					notify(`Saved “${r.title}” to your recordings`);
				}}
			/>
		{/key}
	</section>

	{#if saved}
		<section class="max-w-article surface grid gap-5 px-5 py-5" aria-label="Saved recording">
			<div class="flex flex-wrap items-baseline justify-between gap-3">
				<h2 class="heading-2 mb-0">Saved: {saved.title}</h2>
				<button
					class="link-dim text-sm"
					type="button"
					onclick={() => {
						saved = null;
						round++;
					}}>Record another</button
				>
			</div>
			<RecordingNotes recording={{ id: saved.id, notes: "" }} />
			<p class="text-sm opacity-90">
				It is in <a class="link-dim" href="/{data.account.slug}/ideas/recordings">your recordings</a
				>
				either way. To make it a demo:
			</p>
			<RecordingActions recording={saved} projects={data.projects} fromSong={data.fromSong} />
		</section>
	{/if}

	<p class="max-w-article text-13px opacity-70">
		Tips: keep the screen on and the app in front while recording (a phone stops the microphone when
		it sleeps or switches apps). Voice processing is switched off so instruments sound like
		themselves. The take is saved as your browser recorded it and converted to MP3 for playback.
	</p>
</main>
