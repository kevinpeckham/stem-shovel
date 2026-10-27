<script lang="ts">
	import SessionPageRecording from "#lib/components/SessionPageRecording.svelte";
	import SessionPlayer, { type SessionTrack } from "#lib/components/SessionPlayer.svelte";
	import ShareLinks from "#lib/components/ShareLinks.svelte";
	import Waveform from "#lib/components/Waveform.svelte";
	import { saveSessionEq } from "#lib/remote/sessions.remote.js";
	import { downloadBuilt } from "#lib/utils/downloadBuilt.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { SESSION_KIND_LABELS } from "#lib/constants/sessionRecordings.js";
	import { dayText, sessionDisplayName } from "#lib/utils/sessionName.js";

	/**
	 * A whole session (docs/uploads-and-blob.md, "Sessions"): its name, kind,
	 * day and place, the waveform of the recording playing (or the first),
	 * the player (SessionPlayer with every recording queued in order), the
	 * MP3s in one zip and each recording with its downloads. Members see the
	 * session's viewing links too; a visitor arrives through one.
	 */
	let { data } = $props();
	const session = $derived(data.session);
	const recordings = $derived(data.recordings);
	const name = $derived(sessionDisplayName(session));
	type Recording = (typeof data.recordings)[number];
	const queue = $derived<SessionTrack[]>(
		recordings.map((r) => ({
			id: r.id,
			title: r.title,
			url: r.playbackUrl ?? r.url,
			session: name,
			sessionId: session.id,
			sessionEq: session.eq,
			spectrum: r.spectrum,
		})),
	);
	const mp3sReady = $derived(recordings.filter((r) => r.playbackStatus === "ready").length);
	const totalBytes = $derived(recordings.reduce((n, r) => n + r.sizeBytes, 0));
	let player = $state<SessionPlayer | null>(null);
	let current = $state<string | null>(null);
	let paused = $state(true);
	let currentTime = $state(0);
	let duration = $state(0);
	let loop = $state<{ start: number; end: number } | null>(null);
	let looping = $state(false);
	/** The recording the waveform shows: the one playing, else the first. */
	const shown = $derived(recordings.find((r) => r.id === current) ?? recordings[0] ?? null);
	const length = $derived(
		shown ? (current === shown.id && duration ? duration : shown.durationSeconds || 0) : 0,
	);
	let sharePanel = $state<HTMLDivElement | null>(null);
	/** Kind, day, the place when a name hides it, how many recordings and how big; who shared it, for a visitor. */
	const headerLine = $derived(
		[
			SESSION_KIND_LABELS[session.kind],
			dayText(session.startsOn),
			session.name ? session.place : "",
			`${recordings.length} ${recordings.length === 1 ? "recording" : "recordings"}`,
			recordings.length ? formatBytes(totalBytes) : "",
			data.member ? "" : `shared by ${data.account.name}`,
		]
			.filter(Boolean)
			.join(" · "),
	);
	/** The playhead and the loop on the waveform, while the shown recording is the one playing. */
	const onShown = $derived(!!shown && current === shown.id && length > 0);
	const progress = $derived(onShown ? currentTime / length : 0);
	const range = $derived(
		onShown && loop ? { from: loop.start / length, to: loop.end / length } : null,
	);
	/** Starts the shown recording first when another (or none) is current. */
	function onShownTrack(id: string) {
		if (current !== id) void player?.play(id);
	}

	/** The player's play toggles the track already current, so a row's button plays and pauses. */
	const toggle = (r: Recording) => void player?.play(r.id);
	function playAll() {
		const first = recordings[0];
		if (first && (current !== first.id || paused)) void player?.play(first.id);
	}
</script>

<svelte:head>
	<title>{pageTitle(`${name} · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		{#if data.member}
			<p class="mb-2 text-sm">
				<a class="link-dim" href="/{data.account.slug}/sessions">← Sessions</a>
			</p>
		{/if}
		<h1 class="heading-2 mb-1" data-session-title>{name}</h1>
		<p class="text-14px text-dim">{headerLine}</p>
		{#if session.notes}
			<p class="mt-2 whitespace-pre-wrap text-14px opacity-85">{session.notes}</p>
		{/if}
	</header>

	<div class="max-w-article grid gap-4">
		{#if shown}
			<div class="relative rounded bg-blue-300/5">
				{#if shown.peaks}
					<Waveform
						peaks={shown.peaks}
						{progress}
						label={shown.title}
						onseek={(f) => {
							onShownTrack(shown.id);
							player?.seekTo(f * length);
						}}
						{range}
						onrange={(from, to) => {
							onShownTrack(shown.id);
							player?.setLoop({ start: from * length, end: to * length });
						}}
					/>
				{:else}
					<p class="grid h-14 place-items-center text-12px opacity-80">
						The waveform is on its way…
					</p>
				{/if}
			</div>
			<SessionPlayer
				bind:this={player}
				{queue}
				bind:current
				bind:paused
				bind:currentTime
				bind:duration
				bind:loop
				bind:looping
				canEdit={data.member}
				onsaveshared={async (id, eq) => (await saveSessionEq({ id, eq })).eq}
			/>
		{/if}
		<div class="flex flex-wrap gap-2">
			<button
				class="button button-sm"
				type="button"
				title="Play the session's recordings in order"
				disabled={recordings.length === 0}
				onclick={playAll}
			>
				<span class="i-ph-play-fill" aria-hidden="true"></span> Play all
			</button>
			<button
				class="button button-sm"
				type="button"
				title={mp3sReady
					? `${mp3sReady} of ${recordings.length} MP3s ready, in one zip`
					: "The MP3s are still rendering"}
				disabled={mp3sReady === 0}
				onclick={() =>
					downloadBuilt(
						`/api/recording-sessions/${session.id}/mp3.zip`,
						"the session's MP3s",
						`${name} MP3s.zip`,
					)}
			>
				<span class="i-ph-file-zip" aria-hidden="true"></span> Download MP3s
			</button>
			{#if data.canEdit}
				<button
					class="button button-sm"
					type="button"
					title="Viewing links for the whole session"
					onclick={() => sharePanel?.showPopover()}
				>
					<span class="i-ph-paper-plane-tilt" aria-hidden="true"></span> Share
				</button>
			{/if}
		</div>
		{#if recordings.length === 0}
			<p class="text-14px text-dim">No recordings yet.</p>
		{:else}
			<ul class="divide-y divide-white/10 text-15px" aria-label="{name} recordings">
				{#each recordings as r (r.id)}
					<SessionPageRecording
						recording={r}
						href="/{data.account.slug}/sessions/r/{r.id}"
						startsOn={session.startsOn}
						current={current === r.id}
						playing={current === r.id && !paused}
						ontoggle={() => toggle(r)}
					/>
				{/each}
			</ul>
		{/if}
	</div>
</main>

{#if data.canEdit}
	<div
		id="session-share"
		popover="auto"
		bind:this={sharePanel}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Share "{name}"</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="session-share"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		<p class="mb-3 text-sm text-dim">
			A link opens every recording of this session on a page of its own, for someone outside the
			band; the rest of the sessions stay members-only.
		</p>
		<ShareLinks target={{ sessionId: session.id }} links={data.shareLinks} isPrivate={true} />
	</div>
{/if}
