<script lang="ts">
	import { goto } from "$app/navigation";
	import SessionRecorder from "#lib/components/SessionRecorder.svelte";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/** Record a session in the app (docs/uploads-and-blob.md, "The session recorder"): one stereo take of the room, straight into the sessions. */
	let { data } = $props();
</script>

<svelte:head>
	<title>{pageTitle(`Record · Sessions · ${data.account.name}`)}</title>
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		<p class="mb-2 text-sm">
			<a class="link-dim" href="/{data.account.slug}/sessions">← Sessions</a>
		</p>
		<h1 class="heading-2">Record a session</h1>
		<p class="opacity-90 text-balance">
			The room through the microphone or the line in, in stereo, as one recording in the band's
			sessions. Press Record, play the set, press Stop; name it and save. Keep this page open while
			it records: a phone records only with the screen on.
		</p>
	</header>
	<div class="max-w-article">
		<SessionRecorder
			accountId={data.account.id}
			sessions={data.sessions}
			onsaved={(id) => void goto(`/${data.account.slug}/sessions?recording=${id}`)}
		/>
	</div>
</main>
