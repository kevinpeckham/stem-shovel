<script lang="ts">
	import SessionPlayer, { type SessionTrack } from "#lib/components/SessionPlayer.svelte";
	import ShareLinks from "#lib/components/ShareLinks.svelte";
	import Waveform from "#lib/components/Waveform.svelte";
	import { saveSessionEq } from "#lib/remote/sessions.remote.js";
	import { saveAs } from "#lib/upload.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";
	import { SESSION_DEVICE_LABELS } from "#lib/constants/sessionRecordings.js";
	import { recordingDownloadName } from "#lib/utils/recordingDownloadName.js";
	import { recordingInputText } from "#lib/utils/recordingInputText.js";
	import { dayText } from "#lib/utils/sessionName.js";

	/**
	 * One session recording (docs/uploads-and-blob.md, "Sessions"): the
	 * title, its session and day, the waveform with the playhead, the
	 * player (SessionPlayer with a queue of one) and the downloads. Members
	 * see the viewing links too; a visitor arrives through one.
	 */
	let { data } = $props();
	const r = $derived(data.recording);
	/** The input device's label, for the download names (in place of the input's name when it has none). */
	const deviceLabel = $derived(SESSION_DEVICE_LABELS[r.device]);
	/** The input device's label and the input's name, as one line; "" when neither is set. */
	const inputText = $derived(recordingInputText(r.device, r.source));
	const queue = $derived<SessionTrack[]>([
		{
			id: r.id,
			title: r.title,
			url: r.playbackUrl ?? r.url,
			session: r.session?.name ?? "",
			sessionId: r.session?.id ?? r.id,
			sessionEq: r.session?.eq ?? null,
		},
	]);
	let player = $state<SessionPlayer | null>(null);
	let current = $state<string | null>(null);
	let paused = $state(true);
	let currentTime = $state(0);
	let duration = $state(0);
	let loop = $state<{ start: number; end: number } | null>(null);
	let looping = $state(false);
	const length = $derived(duration || r.durationSeconds || 0);
	let sharePanel = $state<HTMLDivElement | null>(null);
</script>

<svelte:head>
	<title>{pageTitle(`${r.title} · ${data.account.name}`)}</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<main class="page">
	<header class="max-w-article mb-6">
		{#if data.member}
			<p class="mb-2 text-sm">
				<a class="link-dim" href="/{data.account.slug}/sessions?recording={r.id}">← Sessions</a>
			</p>
		{/if}
		<h1 class="heading-2 mb-1" data-recording-title>{r.title}</h1>
		<p class="text-14px text-dim">
			{#if r.session}{r.session.name} ·
			{/if}{dayText(r.recordedOn)}{#if inputText}
				· {inputText}{/if}{#if r.uploader}
				· {r.uploader}{/if} · {formatBytes(r.sizeBytes)}{#if length}
				· {formatTime(length)}{/if}
			{#if !data.member}
				· shared by {data.account.name}
			{/if}
		</p>
		{#if r.notes}
			<p class="mt-2 whitespace-pre-wrap text-14px opacity-85">{r.notes}</p>
		{/if}
	</header>

	<div class="max-w-article grid gap-4">
		<div class="relative rounded bg-blue-300/5">
			{#if r.peaks}
				<Waveform
					peaks={r.peaks}
					progress={length > 0 ? currentTime / length : 0}
					label={r.title}
					onseek={(f) => {
						if (current !== r.id) void player?.play(r.id);
						player?.seekTo(f * length);
					}}
					range={loop && length > 0 ? { from: loop.start / length, to: loop.end / length } : null}
					onrange={(from, to) => {
						if (current !== r.id) void player?.play(r.id);
						player?.setLoop({ start: from * length, end: to * length });
					}}
				/>
			{:else}
				<p class="grid h-14 place-items-center text-12px opacity-80">The waveform is on its way…</p>
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
		<div class="flex flex-wrap gap-2">
			{#if r.playbackStatus === "ready" && r.playbackUrl}
				<button
					class="button button-sm"
					type="button"
					onclick={() =>
						saveAs(
							r.playbackUrl!,
							recordingDownloadName(r.title, r.filename, "mp3", r.source, deviceLabel),
						)}
				>
					<span class="i-ph-download-simple" aria-hidden="true"></span> Download MP3
				</button>
			{/if}
			<button
				class="button button-sm"
				type="button"
				title={r.filename}
				onclick={() =>
					saveAs(
						r.url,
						recordingDownloadName(r.title, r.filename, undefined, r.source, deviceLabel),
					)}
			>
				<span class="i-ph-file-audio" aria-hidden="true"></span> Download {r.playbackUrl
					? "original"
					: "file"}
			</button>
			{#if data.canEdit}
				<button
					class="button button-sm"
					type="button"
					title="Viewing links for this recording"
					onclick={() => sharePanel?.showPopover()}
				>
					<span class="i-ph-paper-plane-tilt" aria-hidden="true"></span> Share
				</button>
			{/if}
		</div>
	</div>
</main>

{#if data.canEdit}
	<div
		id="recording-share"
		popover="auto"
		bind:this={sharePanel}
		class="m-auto max-h-[calc(100vh-2rem)] overflow-y-auto w-[min(32rem,calc(100vw-2rem))] rounded-md border border-white/15 bg-oxford p-6 text-neutral-100 shadow-2xl shadow-black/60 [&::backdrop]:bg-black/60"
	>
		<div class="mb-4 flex items-center justify-between gap-4">
			<h2 class="heading-2 mb-0">Share "{r.title}"</h2>
			<button
				class="button button-xs"
				type="button"
				popovertarget="recording-share"
				popovertargetaction="hide"
			>
				Close
			</button>
		</div>
		<ShareLinks target={{ recordingId: r.id }} links={data.shareLinks} isPrivate={true} />
	</div>
{/if}
