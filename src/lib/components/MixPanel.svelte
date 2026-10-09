<script lang="ts">
	import { computePeaks, PEAK_BINS } from "#lib/audio/peaks.js";
	import CommentTimeline from "#lib/components/CommentTimeline.svelte";
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import Waveform from "#lib/components/Waveform.svelte";
	import { MIX_ACCEPT, MIX_NOTES_MAX } from "#lib/constants/mixFormats.js";
	import { deleteComment } from "#lib/remote/comments.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import { saveAs } from "#lib/upload.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { formatDate } from "#lib/utils/formatDate.js";
	import { formatTime } from "#lib/utils/formatTime.js";
	import type { Snippet } from "svelte";

	/**
	 * The player's Mixes view (docs/mixes.md): the song's mixes newest first,
	 * the chosen one with a transport, its waveform (click to seek; ⌘-click,
	 * Ctrl-click or right-click for the page's "Comment here" menu), a
	 * Comments row of its located comments (CommentTimeline, the page's
	 * card), the engineer's notes (markdown, edited in place by editors)
	 * and the mix's comments in a list. Editors upload, rename, remove and
	 * share from here through the page's callbacks; the page runs the
	 * uploads and refreshes after each change.
	 */
	export interface PanelMix {
		id: string;
		version: number;
		label: string;
		notes: string;
		notesHtml: string;
		status: string;
		url: string;
		playbackUrl: string | null;
		filename: string;
		sizeBytes: number;
		durationSeconds: number | null;
		peaks: number[] | null;
		createdAt: Date;
		uploader: { name: string } | null;
	}
	export interface MixComment {
		id: string;
		mixId: string;
		userId: string;
		authorName: string;
		title: string;
		body: string;
		at: number | null;
		createdAt: Date;
		editedAt: Date | null;
	}
	export interface MixUploadJob {
		name: string;
		percent: number;
		error?: string;
		decoding?: boolean;
	}
	interface Props {
		mixes: PanelMix[];
		comments: MixComment[];
		/** The chosen mix; the page sets it from ?mix= and keeps it. */
		selectedId?: string | null;
		canEdit?: boolean;
		canComment?: boolean;
		me?: { id: string } | null;
		isAdmin?: boolean;
		/** At least this tall (the stem player's box, so the page keeps its shape across the toggle). */
		minHeight?: number;
		/** Uploads in flight (the page runs them). */
		jobs?: MixUploadJob[];
		/** A position as the song shows it (time, timecode or bars). */
		showPos: (seconds: number) => string;
		/** The comment card for the timeline's bubbles (the page's, with its forms). */
		card: Snippet<[string]>;
		onfiles?: (files: File[]) => void;
		onrename?: (mix: PanelMix) => void;
		onnotes?: (mix: PanelMix, notes: string) => Promise<void> | void;
		onremove?: (mix: PanelMix) => void;
		onshare?: (mix: PanelMix) => void;
		/** Comment on the mix, at a spot (seconds) or about it in general (null). */
		oncomment?: (mix: PanelMix, seconds: number | null) => void;
		oneditcomment?: (comment: MixComment) => void;
		/** ⌘-click, Ctrl-click or right-click on the waveform: the page's menu (Seek here, Comment here). */
		oncontext?: (mix: PanelMix, seconds: number, x: number, y: number) => void;
	}
	let {
		mixes,
		comments,
		selectedId = $bindable(null),
		canEdit = false,
		canComment = false,
		me = null,
		isAdmin = false,
		minHeight = 0,
		jobs = [],
		showPos,
		card,
		onfiles,
		onrename,
		onnotes,
		onremove,
		onshare,
		oncomment,
		oneditcomment,
		oncontext,
	}: Props = $props();

	let ready = $derived(mixes.filter((m) => m.status === "ready" && m.url));
	let newestFirst = $derived(ready.toSorted((a, b) => b.version - a.version));
	/** The chosen mix, or the newest; a chosen id that is gone (removed) falls back too. */
	let mix = $derived(ready.find((m) => m.id === selectedId) ?? newestFirst[0] ?? null);
	let mixComments = $derived(mix ? comments.filter((c) => c.mixId === mix.id) : []);
	let located = $derived(
		mixComments
			.filter((c) => c.at !== null)
			.map((c) => ({ id: c.id, title: c.title, at: c.at ?? 0 }))
			.toSorted((a, b) => a.at - b.at),
	);

	// ---- playback: one <audio> for the chosen mix ----
	let audio = $state<HTMLAudioElement | null>(null);
	let paused = $state(true);
	let position = $state(0);
	let length = $state(0);
	let volume = $state(1);
	let src = $derived(mix ? (mix.playbackUrl ?? mix.url) : "");
	function seek(seconds: number) {
		if (!audio) return;
		audio.currentTime = Math.max(0, Math.min(seconds, length || seconds));
		position = audio.currentTime;
	}
	function toggle() {
		if (!audio || !mix) return;
		if (audio.paused) void audio.play().catch(() => (paused = true));
		else audio.pause();
	}
	export function pause() {
		audio?.pause();
	}
	/** The page's menu (Seek here) and a comment's Go to. */
	export function seekTo(seconds: number) {
		seek(seconds);
	}
	function choose(id: string) {
		if (id === selectedId && mix?.id === id) return;
		audio?.pause();
		position = 0;
		selectedId = id;
	}

	// ---- the waveform's peaks: from the upload, else decoded from the file here ----
	let decoded = $state<Record<string, number[]>>({});
	let decoding = new Set<string>();
	async function decodePeaks(m: PanelMix) {
		if (decoded[m.id] || decoding.has(m.id)) return;
		decoding.add(m.id);
		try {
			const ctx = new AudioContext();
			const bytes = await (await fetch(m.playbackUrl ?? m.url)).arrayBuffer();
			const buffer = await ctx.decodeAudioData(bytes);
			decoded = { ...decoded, [m.id]: Array.from(computePeaks(buffer, PEAK_BINS)) };
			await ctx.close();
		} catch (e) {
			console.error("[mixes] peaks", e);
		} finally {
			decoding.delete(m.id);
		}
	}
	let peaks = $derived.by(() => {
		if (!mix) return [];
		if (mix.peaks?.length) return mix.peaks;
		const d = decoded[mix.id];
		if (d) return d;
		void decodePeaks(mix);
		return [];
	});
	let duration = $derived(length || mix?.durationSeconds || 0);
	/** What the Comments row needs of this player (CommentTimeline's TimelineSource). */
	let source = $derived({
		get duration() {
			return duration;
		},
		get position() {
			return position;
		},
		get mixPeaks() {
			return peaks;
		},
		stems: [] as { peaks: number[]; duration: number }[],
		seek,
	});

	// ---- the engineer's notes, edited in place ----
	let editingNotes = $state(false);
	let notesDraft = $state("");
	let savingNotes = $state(false);
	function startNotes() {
		notesDraft = mix?.notes ?? "";
		editingNotes = true;
	}
	async function saveNotes() {
		if (!mix) return;
		savingNotes = true;
		try {
			await onnotes?.(mix, notesDraft);
			editingNotes = false;
		} finally {
			savingNotes = false;
		}
	}

	// ---- uploads ----
	let picker = $state<HTMLInputElement | null>(null);
	export function pick() {
		picker?.click();
	}
	function onpick(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const files = Array.from(input.files ?? []);
		input.value = "";
		if (files.length) onfiles?.(files);
	}

	const canEditComment = (c: MixComment) => !!me && c.userId === me.id;
	const canDeleteComment = (c: MixComment) => canEditComment(c) || isAdmin;
</script>

<section
	class="rounded-md border border-current/40 bg-blue/5 px-4 py-3 grid gap-4 content-start"
	style:min-height={minHeight ? `${minHeight}px` : undefined}
	aria-label="Mix player"
	data-mix-panel
>
	{#if mix}
		<!-- svelte-ignore a11y_media_has_caption -->
		<audio
			bind:this={audio}
			{src}
			preload="metadata"
			bind:volume
			onplay={() => (paused = false)}
			onpause={() => (paused = true)}
			onended={() => (paused = true)}
			ontimeupdate={() => (position = audio?.currentTime ?? 0)}
			onloadedmetadata={() => (length = audio?.duration ?? 0)}
			ondurationchange={() => (length = audio?.duration ?? 0)}
		></audio>
		<!-- the transport -->
		<div class="flex flex-wrap items-center gap-4">
			<button
				type="button"
				class="grid h-12 w-12 place-items-center rounded-lg bg-accent text-oxford transition-all hover:shadow-lg hover:shadow-maximumYellow/30 active:scale-95"
				aria-label={paused ? "Play" : "Pause"}
				onclick={toggle}
			>
				<span class="{paused ? 'i-ph-play-fill' : 'i-ph-pause-fill'} text-20px" aria-hidden="true"
				></span>
			</button>
			<div class="min-w-0 grow">
				<p class="truncate font-500">
					<span class="rounded border border-current/30 px-1 text-11px tabular-nums mr-1"
						>v{mix.version}</span
					>{mix.label}
				</p>
				<p class="text-sm text-dim tabular-nums">
					{formatTime(position)} / {formatTime(duration)}
					{#if mix.uploader}· {mix.uploader.name}{/if} · {formatDate(mix.createdAt)}
				</p>
			</div>
			<label class="flex items-center gap-2 text-sm text-dim">
				<span class="i-ph-speaker-high" aria-hidden="true"></span>
				<span class="sr-only">Volume</span>
				<input
					type="range"
					class="w-28 accent-blue-300"
					min="0"
					max="1"
					step="0.01"
					bind:value={volume}
					aria-label="Volume"
				/>
			</label>
			{#if canComment}
				<button
					type="button"
					class="button button-xs"
					title="Comment on this mix"
					aria-label="Comment on this mix"
					onclick={() => oncomment?.(mix, null)}
				>
					<span class="i-ph-chat-circle-dots" aria-hidden="true"></span>
					Comment
				</button>
			{/if}
			<ContextMenu
				ariaLabel="{mix.label} actions"
				buttonBaseClasses="button button-xs px-1"
				position="bottom right"
				items={[
					{
						id: "download",
						label: `Download ${mix.filename.split(".").pop()?.toUpperCase() ?? "file"} (${formatBytes(mix.sizeBytes)})`,
						iconClass: "i-ph-download-simple",
						action: () => void saveAs(mix.url, mix.filename),
					},
					...(mix.playbackUrl
						? [
								{
									id: "download-mp3",
									label: "Download MP3",
									iconClass: "i-ph-file-audio",
									action: () =>
										void saveAs(
											mix.playbackUrl ?? "",
											`${mix.filename.replace(/\.[^.]+$/, "")}.mp3`,
										),
								},
							]
						: []),
					...(canEdit
						? [
								{
									id: "share",
									label: "Share by email",
									iconClass: "i-ph-paper-plane-tilt",
									action: () => onshare?.(mix),
								},
								{
									id: "rename",
									label: "Rename",
									iconClass: "i-ph-pencil-simple",
									action: () => onrename?.(mix),
								},
								{
									id: "remove",
									label: "Remove",
									iconClass: "i-ph-trash",
									action: () => onremove?.(mix),
								},
							]
						: []),
				]}
			/>
		</div>
		<!-- the waveform with the playhead, and the mix's comments on it -->
		<div class="grid gap-1">
			<div class="h-16">
				<Waveform
					{peaks}
					progress={duration > 0 ? position / duration : 0}
					label={mix.label}
					onseek={(f) => seek(f * duration)}
					oncontext={oncontext ? (f, x, y) => oncontext(mix, f * duration, x, y) : undefined}
				/>
			</div>
			<CommentTimeline
				engine={source}
				comments={located}
				{card}
				{canComment}
				oncontext={oncontext ? (seconds, x, y) => oncontext(mix, seconds, x, y) : undefined}
			/>
		</div>
		<!-- the engineer's notes -->
		<section class="grid gap-2" aria-label="Notes on this mix">
			<div class="flex items-baseline justify-between gap-3">
				<h3 class="text-13px uppercase tracking-wider opacity-70">Notes from the mix</h3>
				{#if canEdit && !editingNotes}
					<button type="button" class="link-dim text-12px" onclick={startNotes}
						>{mix.notes ? "Edit notes" : "Add notes"}</button
					>
				{/if}
			</div>
			{#if editingNotes}
				<textarea
					class="field w-full text-sm"
					rows="4"
					maxlength={MIX_NOTES_MAX}
					aria-label="Notes on this mix"
					placeholder="What changed in this mix, what to listen for… (markdown)"
					bind:value={notesDraft}></textarea>
				<div class="flex gap-2">
					<button class="button button-xs" type="button" disabled={savingNotes} onclick={saveNotes}
						>{savingNotes ? "Saving…" : "Save notes"}</button
					>
					<button class="button button-xs" type="button" onclick={() => (editingNotes = false)}
						>Cancel</button
					>
				</div>
			{:else if mix.notesHtml}
				<div class="chart-body text-15px">{@html mix.notesHtml}</div>
			{:else}
				<p class="text-sm opacity-70">No notes on this mix yet.</p>
			{/if}
		</section>
		<!-- the mix's comments -->
		<section class="grid gap-2" aria-label="Comments on this mix">
			<h3 class="text-13px uppercase tracking-wider opacity-70">
				{mixComments.length
					? `Comments on v${mix.version} (${mixComments.length})`
					: `Comments on v${mix.version}`}
			</h3>
			{#if mixComments.length === 0}
				<p class="text-sm opacity-70">
					{canComment
						? "No comments on this mix yet. Comment, or ⌘-click (Ctrl-click) the waveform at a spot."
						: "No comments on this mix yet."}
				</p>
			{:else}
				<ol class="grid gap-2">
					{#each mixComments as c (c.id)}
						{@const remove = deleteComment.for(`mix:${c.id}`)}
						<li class="rounded-md border border-white/10 bg-black/20 px-3 py-2" data-mix-comment>
							<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
								<h4 class="font-600">{c.title}</h4>
								<span class="text-12px opacity-70">
									{c.authorName} · {formatDate(c.createdAt)}
									{#if c.editedAt}<span class="ml-1 text-10px uppercase tracking-wider">edited</span
										>{/if}
								</span>
							</div>
							{#if c.at !== null}
								<button
									type="button"
									class="mt-1 text-12px link-dim"
									onclick={() => seek(c.at ?? 0)}
									title="Go to this position"
								>
									<span class="i-ph-map-pin mr-1" aria-hidden="true"></span>{showPos(c.at)}
								</button>
							{/if}
							<p class="mt-1 whitespace-pre-line text-15px">{c.body}</p>
							{#if canEditComment(c) || canDeleteComment(c)}
								<div class="mt-2 flex gap-3 text-12px">
									{#if canEditComment(c)}
										<button type="button" class="link-dim" onclick={() => oneditcomment?.(c)}
											>Edit</button
										>
									{/if}
									{#if canDeleteComment(c)}
										<form
											{...remove.enhance(async ({ submit }) => {
												if (!confirm(`Delete the comment "${c.title}"?`)) return;
												await submit();
												notify("Comment deleted");
											})}
										>
											<input {...remove.fields.id.as("hidden", c.id)} />
											<button class="link-dim" disabled={!!remove.pending}
												>{remove.pending ? "Deleting…" : "Delete"}</button
											>
										</form>
									{/if}
								</div>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</section>
	{:else}
		<p class="text-dim">
			{canEdit ? "No mixes yet. Upload the first bounce for the band to hear." : "No mixes yet."}
		</p>
	{/if}
	<!-- every mix, newest first -->
	{#if newestFirst.length > 1 || (mix && canEdit)}
		<section class="grid gap-1" aria-label="All mixes">
			<h3 class="text-13px uppercase tracking-wider opacity-70">All mixes</h3>
			<ul class="grid gap-1">
				{#each newestFirst as m (m.id)}
					<li>
						<button
							type="button"
							class="flex w-full items-baseline gap-3 rounded px-2 py-1 text-left text-sm {m.id ===
							mix?.id
								? 'bg-white/10'
								: 'hover-bg-white/5'}"
							aria-pressed={m.id === mix?.id}
							onclick={() => choose(m.id)}
						>
							<span class="tabular-nums opacity-70">v{m.version}</span>
							<span class="min-w-0 grow truncate">{m.label}</span>
							<span class="text-12px opacity-60 tabular-nums"
								>{comments.filter((c) => c.mixId === m.id).length || ""}
								{#if m.uploader}{m.uploader.name} ·
								{/if}{formatDate(m.createdAt)}</span
							>
						</button>
					</li>
				{/each}
			</ul>
		</section>
	{/if}
	{#if jobs.length}
		<ul class="grid gap-1 text-sm" aria-label="Mix uploads">
			{#each jobs as job (job.name)}
				<li class="flex items-center gap-3">
					<span class="min-w-0 grow truncate">{job.name}</span>
					{#if job.error}<span class="text-red-300">{job.error}</span>{:else if job.decoding}<span
							class="opacity-70">Reading the waveform…</span
						>{:else}<span class="tabular-nums opacity-70">{Math.round(job.percent)}%</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
	{#if canEdit}
		<div>
			<input
				bind:this={picker}
				type="file"
				class="hidden"
				accept={MIX_ACCEPT}
				multiple
				onchange={onpick}
			/>
			<button class="button button-sm" type="button" onclick={pick}>
				<span class="i-ph-upload-simple" aria-hidden="true"></span>
				Upload Mix
			</button>
		</div>
	{/if}
</section>
