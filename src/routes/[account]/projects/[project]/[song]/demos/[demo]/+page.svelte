<script lang="ts">
	import { afterNavigate, replaceState } from "$app/navigation";
	import { page } from "$app/state";
	import CommentCard from "#lib/components/CommentCard.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import RecordingCommentPopover from "#lib/components/RecordingCommentPopover.svelte";
	import DemoNotesBlock from "#lib/components/DemoNotesBlock.svelte";
	import RecordingReview from "#lib/components/RecordingReview.svelte";
	import SongSharePopover from "#lib/components/SongSharePopover.svelte";
	import { DEMO_DEFAULT_VOLUME } from "#lib/constants/demoFormats.js";
	import { saveAs } from "#lib/upload.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import { pageTitle } from "#lib/utils/pageTitle.js";

	/**
	 * A demo recording's own page, as a mix has one (docs/mixes.md): what
	 * the demo's share link opens. The song and the demo's name, who
	 * uploaded it and when, the notes they gave it at upload, a player
	 * (play, seek, volume), the downloads, the waveform with the demo's comments (RecordingReview) and, for an
	 * editor, the share popover aimed at the demo (`?open=share`, the
	 * Demos view's Share…, opens it).
	 */
	let { data } = $props();

	const demo = $derived(data.demo);
	const songPath = $derived(
		`/${data.account.slug}/projects/${data.song.project.slug}/${data.song.slug}`,
	);
	let audio = $state<HTMLAudioElement | null>(null);
	let paused = $state(true);
	let currentTime = $state(0);
	let duration = $state(0);
	let volume = $state(DEMO_DEFAULT_VOLUME);
	const length = $derived(duration || demo.durationSeconds || 0);
	/** Who uploaded it, when, its size and length, as one line. */
	const details = $derived(
		[
			demo.uploader?.name,
			formatDate(demo.createdAt),
			formatBytes(demo.sizeBytes),
			length ? formatTime(length) : "",
		]
			.filter(Boolean)
			.join(" · "),
	);
	function seekTo(seconds: number) {
		const at = Math.max(0, length ? Math.min(seconds, length) : seconds);
		if (audio) audio.currentTime = at;
		currentTime = at;
	}

	let commentPopover = $state<RecordingCommentPopover | null>(null);
	/** A position on a demo is time, never bars. */
	const playhead = $derived({ disabled: false, read: () => formatTime(currentTime, 2) });

	let sharePopover = $state<SongSharePopover | null>(null);
	/** The Demos view's Share… lands here with `?open=share`: the popover opens and the query goes. */
	afterNavigate(() => {
		if (page.url.searchParams.get("open") !== "share") return;
		if (data.canEdit) sharePopover?.showShare();
		const url = new URL(page.url.href);
		url.searchParams.delete("open");
		replaceState(url, {});
	});

	const toolbarButton = "button button-sm bg-blue-300/5 border-current/40 hover-border-accent";
</script>

<svelte:head>
	<title>{pageTitle(`${demo.label} · ${data.song.title}`)}</title>
</svelte:head>

<main class="page">
	<header class="mb-6 flex flex-wrap items-start justify-between gap-4">
		<div class="min-w-0">
			<p class="text-sm opacity-80">
				<a class="underline underline-offset-2" href={songPath}>{data.song.title}</a>
				<span class="opacity-60">·</span>
				<a
					class="underline underline-offset-2"
					href="/{data.account.slug}/projects/{data.song.project.slug}">{data.song.project.name}</a
				>
			</p>
			<h1 class="app-page-heading">
				{demo.label}
				<span class="opacity-70 text-0.8em">demo of {data.song.title}</span>
			</h1>
			<p class="text-15px opacity-80">
				{details}
			</p>
		</div>
		<nav class="flex flex-wrap justify-end gap-2" aria-label="Demo actions">
			{#if data.canComment}
				<button
					type="button"
					class={toolbarButton}
					title="Comment on this demo"
					aria-label="Comment on this demo"
					onclick={() => commentPopover?.open()}
				>
					<span class="block i-ph-hands-clapping-bold"></span>
				</button>
			{/if}
			<ContextMenu
				ariaLabel="Download"
				title="Download the demo"
				clearButtonBaseClasses={true}
				buttonClasses={toolbarButton}
				iconClass="i-ph-download-simple"
				position="bottom right"
				items={[
					{
						id: "demo-download-mp3",
						kind: "button",
						label: "Download MP3",
						title: "The MP3 made for streaming",
						iconClass: "i-ph-download-simple",
						condition: !!demo.playbackUrl,
						action: () => void saveAs(demo.playbackUrl ?? "", `${demo.label}.mp3`),
					},
					{
						id: "demo-download-source",
						kind: "button",
						label: demo.playbackUrl ? "Download original" : "Download file",
						title: demo.filename,
						iconClass: "i-ph-file-audio",
						action: () => void saveAs(demo.url, demo.filename),
					},
				]}
			/>
			{#if data.canEdit}
				<button
					type="button"
					class={toolbarButton}
					title="Share this demo"
					aria-label="Share demo"
					onclick={() => sharePopover?.showShare()}
				>
					<span class="block i-ph-paper-plane-tilt"></span>
				</button>
			{/if}
			<a class={toolbarButton} href={songPath} title="The song: stems, chart, lyrics, notes">
				<span class="i-ph-arrow-u-up-left" aria-hidden="true"></span>
				Song
			</a>
		</nav>
	</header>
	<!-- What the uploader said about the take, typed at upload; an editor changes it in the notes popover. -->
	<DemoNotesBlock {demo} canEdit={data.canEdit} />

	<audio
		bind:this={audio}
		src={demo.playbackUrl ?? demo.url}
		bind:paused
		bind:currentTime
		bind:duration
		bind:volume
		preload="metadata"
	></audio>

	<section
		class="max-w-3xl rounded-md border border-current/40 bg-blue/5 px-4 py-3 grid gap-4"
		aria-label="Demo player"
	>
		<div class="flex flex-wrap items-center gap-4">
			<button
				type="button"
				class="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-accent text-oxford transition-all hover:shadow-lg hover:shadow-maximumYellow/30 active:scale-95"
				aria-label={paused ? "Play" : "Pause"}
				onclick={() => (paused = !paused)}
			>
				<span class="{paused ? 'i-ph-play-fill' : 'i-ph-pause-fill'} text-20px" aria-hidden="true"
				></span>
			</button>
			<p class="min-w-0 grow text-sm text-dim tabular-nums">
				{formatTime(currentTime)} / {formatTime(length)}
			</p>
			<label class="flex items-center gap-2 text-sm text-dim w-full sm:w-auto">
				<span class="i-ph-speaker-high" aria-hidden="true"></span>
				<input
					type="range"
					class="w-full sm:w-32 accent-blue-300"
					min="0"
					max="1"
					step="0.01"
					bind:value={volume}
					aria-label="Volume"
				/>
			</label>
		</div>
		<input
			type="range"
			class="w-full accent-maximumYellow disabled:opacity-40"
			min="0"
			max={length}
			step="0.1"
			value={currentTime}
			disabled={!length}
			oninput={(e) => seekTo(Number(e.currentTarget.value))}
			aria-label="Position"
		/>
		<RecordingReview
			label={demo.label}
			peaks={demo.peaks}
			duration={length}
			position={currentTime}
			comments={data.comments}
			canComment={data.canComment}
			card={commentCard}
			onseek={seekTo}
			oncomment={() => commentPopover?.open()}
			oncontext={(seconds) =>
				data.canComment ? commentPopover?.open({ at: formatTime(seconds, 2) }) : seekTo(seconds)}
		/>
	</section>
</main>

{#snippet commentCard(id: string)}
	{@const c = data.comments.find((x) => x.id === id)}
	{#if c}<CommentCard
			comment={c}
			pos={(s) => formatTime(s, 1)}
			onseek={seekTo}
			onedit={data.user?.id === c.userId
				? () =>
						commentPopover?.open({
							id: c.id,
							title: c.title,
							body: c.body,
							at: c.at === null ? "" : formatTime(c.at, 2),
						})
				: undefined}
		/>{/if}
{/snippet}

{#if data.canComment}
	<RecordingCommentPopover
		bind:this={commentPopover}
		songId={data.song.id}
		on={{ kind: "demo", id: demo.id }}
		name="“{demo.label}”"
		{playhead}
	/>
{/if}

{#if data.canEdit}
	<!-- Share this demo by email; the viewing links made here land on it. -->
	<SongSharePopover
		bind:this={sharePopover}
		song={data.song}
		shareLinks={data.shareLinks}
		aim={{
			kind: "demo",
			id: demo.id,
			name: `“${demo.label}”`,
			url: `${page.url.origin}${songPath}/demos/${demo.id}`,
		}}
	/>
{/if}
