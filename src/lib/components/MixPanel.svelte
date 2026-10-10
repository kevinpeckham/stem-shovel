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
	import Slider from "#lib/components/Slider.svelte";
	import ComboBox from "#lib/components/ComboBox.svelte";

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
		/** The comment card for the timeline's bubbles (the page's, with its forms). */
		card: Snippet<[string]>;
		onfiles?: (files: File[]) => void;
		/** The title row (the picker, the toolbar, the name and who uploaded it); off on a mix's own page, whose header has them (Kevin). */
		header?: boolean;
		/** A mix chosen in the list or the picker; a page per mix goes to it (docs/mixes.md). */
		onchoose?: (id: string) => void;
		/** The name typed in place: save it. */
		onrename?: (mix: PanelMix, label: string) => Promise<void> | void;
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
		card,
		onfiles,
		header = true,
		onchoose,
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
		onchoose?.(id);
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

	// ---- the name, edited in place (Kevin: no prompt) ----
	let renaming = $state(false);
	let labelDraft = $state("");
	function startRename() {
		labelDraft = mix?.label ?? "";
		renaming = true;
	}
	async function commitRename() {
		if (!renaming || !mix) return;
		renaming = false;
		const label = labelDraft.trim();
		if (label && label !== mix.label) await onrename?.(mix, label);
	}
	function onlabelkeydown(e: KeyboardEvent) {
		if (e.key === "Enter") {
			e.preventDefault();
			void commitRename();
		} else if (e.key === "Escape") {
			e.preventDefault();
			renaming = false;
		}
	}
	/** Where the mix is playing, for the page's comment popover (its Playhead button). */
	export function currentPosition() {
		return position;
	}

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
	class="grid grid-cols-1 gap-3 content-start overflow-x-hidden text-light"
	style:min-height={minHeight ? `${minHeight}px` : undefined}
	aria-label="Mix player"
	data-mix-panel
>
	<!-- Active Mix -->
	<section>
		<div class="relative bg-dark/70 border border-current/40 shadow rounded-md px-4 pt-3 pb-5">
			{#if mix}
				<!-- audio element without controls is hidden by browser default -->
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

				{#if header}
					<!-- Title Row -->
					<div class="grid grid-cols-1 items-start pb-3">
						<!-- Toolbar -->
						<div class="flex flex-wrap gap-y-4 justify-between">
							<div
								class="flex gap-2 text-12px tracking-wide text-blue-300 uppercase tracking-wider opacity-90"
							>
								<span class="flex text-nowrap flex-none">Selected Mix:</span>
								{#if newestFirst.length > 1}
									{@const options = newestFirst.map((n) => {
										return { value: n.id, label: "v" + n.version };
									})}
									<ComboBox
										ariaLabel="Select Mix Version"
										buttonClasses="px-2 bg-dark border border-current/40 rounded"
										popoverClasses="min-w-80px"
										clearDefaultButtonClasses={true}
										value={mix.id}
										{options}
										onchange={(v) => choose(v)}
									/>
								{/if}
							</div>
							<div class="flex justify-end gap-2">
								<!-- comment -->
								{#if canComment}
									<button
										type="button"
										class="button button-xs px-2 bg-blue-300/5 border-current/40 hover-border-accent"
										title="Comment on this mix"
										aria-label="Comment on this mix"
										onclick={() => oncomment?.(mix, null)}
									>
										<span class="i-ph-chat-circle-dots" aria-hidden="true"></span>
									</button>
								{/if}

								<!-- download -->
								<ContextMenu
									ariaLabel="Download"
									title="Download the mix"
									clearButtonBaseClasses={true}
									buttonClasses="button button-xs px-2 bg-blue-300/5 border-current/40 hover-border-accent"
									iconClass="i-ph-download-simple"
									items={[
										{
											id: "mix-download-source",
											kind: "button",
											label: `Download .${mix.filename.split(".").pop()} (${formatBytes(mix.sizeBytes)})`,
											title: "The file as uploaded",
											iconClass: "i-ph-download-simple",
											action: () => void saveAs(mix.url, mix.filename),
										},
										{
											id: "mix-download-mp3",
											kind: "button",
											label: "Download .mp3",
											title: "The MP3 made for streaming",
											iconClass: "i-ph-download-simple",
											// An MP3 upload is its own rendition.
											condition: !!mix.playbackUrl && !/\.mp3$/i.test(mix.filename),
											action: () =>
												void saveAs(
													mix.playbackUrl ?? "",
													`${mix.filename.replace(/\.[^.]+$/, "")}.mp3`,
												),
										},
									]}
								/>

								{#if canEdit}
									<!-- share by email (the page's popover, aimed at this mix) -->
									<button
										type="button"
										aria-label="Share mix"
										id="mix-share-button"
										title="Share this mix by email"
										onclick={() => onshare?.(mix)}
										class="button button-xs px-2 bg-blue-300/5 border-current/40 hover-border-accent"
									>
										<span class="i-ph-paper-plane-tilt block"></span>
									</button>
									<!-- upload (the picker is the one at the foot of the panel) -->
									<button
										class="button button-xs px-2 bg-blue-300/5 border-current/40 hover-border-accent"
										title="Upload a new mix"
										aria-label="Upload a new mix"
										type="button"
										onclick={pick}
									>
										<span class="i-ph-upload-simple" aria-hidden="true"></span>
									</button>
								{/if}

								<!-- delete -->
								{#if canEdit}
									<button
										type="button"
										aria-label="Delete Mix"
										title="Remove this mix, its comments and its file"
										id="mix-remove-button"
										onclick={() => onremove?.(mix)}
										class="button button-xs px-2 bg-blue-300/5 border-current/40 hover-border-accent"
									>
										<span class="i-ph-trash inline-block"></span>
									</button>
								{/if}
							</div>
						</div>

						<!-- name, version, metadata -->
						<div class="min-w-0 grow pt-3 sm-pt-1">
							<div class="flex gap-3 items-baseline min-w-0">
								{#if renaming}
									<!-- svelte-ignore a11y_autofocus -->
									<input
										class="field font-serif text-1.2em w-full min-w-0 py-0"
										aria-label="Mix name"
										maxlength="120"
										autofocus
										bind:value={labelDraft}
										onkeydown={onlabelkeydown}
										onblur={() => void commitRename()}
									/>
								{:else}
									<span class="font-serif text-1.2em truncate">{mix.label}</span>
									{#if canEdit}
										<button
											type="button"
											class="flex shrink-0 items-center justify-center w-4 h-4 bg-blue-300/5 rounded text-11px opacity-90 hover-bg-blue-300/15 hover-text-accent hover-opacity-100"
											title="Rename this mix"
											aria-label="Rename Mix"
											onclick={startRename}
										>
											<span class="i-ph-pencil block" aria-hidden="true"></span>
										</button>
									{/if}
								{/if}
							</div>
							<p class="text-12px tabular-nums">
								<span class="opacity-90">
									{#if mix.uploader}{mix.uploader.name}{/if} · {formatDate(mix.createdAt)}</span
								>
							</p>
						</div>
					</div>
				{/if}
				<!-- the waveform with the playhead, and the mix's comments on it -->
				<div class="grid gap-1 w-full relative bg-blue-300/5">
					<CommentTimeline
						dimWaveform={false}
						engine={source}
						comments={located}
						heading=""
						{card}
						{canComment}
						oncontext={oncontext ? (seconds, x, y) => oncontext(mix, seconds, x, y) : undefined}
						showTip={false}
					/>
					<span class="absolute right-2 bottom-0 text-10px">{formatTime(duration)}</span>
				</div>

				<!-- transport row  -->
				<div class="flex flex-wrap sm-grid grid-cols-[auto_auto_1fr] mt-4 bg-white/0">
					<!-- play button -->
					<button
						type="button"
						class="bg-blue-300/10 grid px-3 place-items-center rounded-l-md border border-current/40"
						aria-label={paused ? "Play" : "Pause"}
						onclick={toggle}
					>
						<span
							class="{paused ? 'i-ph-play-fill' : 'i-ph-pause-fill'} text-16px"
							aria-hidden="true"
						></span>
					</button>

					<!-- counter -->
					<div
						class="bg-black/40 border border-current/40 h-auto py-2 px-3 rounded-r-md leading-none flex gap-4 items-center max-w-fit"
					>
						<span class="text-1em">{formatTime(position)}</span>
					</div>

					<!-- comment -->

					<!-- volume slider -->
					<div class="ml-auto flex w-full max-w-200px items-center gap-2 text-sm text-dim">
						<span class="i-ph-speaker-high" aria-hidden="true"></span>
						<span class="sr-only">Volume</span>
						<Slider bind:value={volume} label="Volume" thickness={4} />
					</div>
				</div>

				<!-- the engineer's notes -->
				<section
					class="mt-4 border-t border-current/20 pt-4 pb-6 grid gap-2"
					aria-label="Notes on this mix"
				>
					<div class="flex items-baseline justify-between gap-3">
						<h3 class="text-12px tracking-wide text-blue-300 uppercase tracking-wider opacity-90">
							Notes on v{mix.version}
						</h3>
						{#if canEdit && !editingNotes}
							<button
								aria-label="Add or Edit Notes"
								type="button"
								class="flex items-center justify-center w-4 h-4 bg-blue-300/5 opacity-90 rounded text-11px hover-bg-blue-300/15 hover-text-accent hover-opacity-100"
								onclick={startNotes}><span class="i-ph-pencil"></span></button
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
							<button
								class="button button-xs"
								type="button"
								disabled={savingNotes}
								onclick={saveNotes}
							>
								<span class="i-ph-floppy-disk-fill"></span>
								{savingNotes ? "Saving…" : "Save"}</button
							>
							<button class="button button-xs" type="button" onclick={() => (editingNotes = false)}
								><span class="i-ph-x"></span>
								Cancel</button
							>
						</div>
					{:else if mix.notesHtml}
						<div class="chart-body text-15px opacity-90">{@html mix.notesHtml}</div>
					{:else}
						<p class="text-15px opacity-90 italic">No notes on this mix yet.</p>
					{/if}
				</section>

				<!-- the mix's comments -->
				<section class="grid gap-2" aria-label="Comments on this mix">
					<div class="flex justify-between items-baseline">
						<h3 class="text-12px tracking-wide text-blue-300 uppercase tracking-wider opacity-90">
							{mixComments.length
								? `Comments on v${mix.version} (${mixComments.length})`
								: `Comments on v${mix.version}`}
						</h3>
						{#if canComment}
							<button
								aria-label="Add Comment"
								type="button"
								class="flex items-center justify-center w-4 h-4 bg-blue-300/5 opacity-90 rounded text-11px hover-bg-blue-300/15 hover-text-accent hover-opacity-100"
								onclick={() => oncomment?.(mix, null)}><span class="i-ph-pencil"></span></button
							>
						{/if}
					</div>
					{#if mixComments.length === 0}
						<p class="text-15px opacity-80">
							{canComment
								? "No comments on this mix yet. ⌘-click (Ctrl-click) the waveform to leave a comment."
								: "No comments on this mix yet."}
						</p>
					{:else}
						<ol class="grid gap-2">
							{#each mixComments as c (c.id)}
								{@const remove = deleteComment.for(`mix:${c.id}`)}
								<li
									class="rounded-md border border-white/10 bg-light/10 px-3 py-2"
									data-mix-comment
								>
									<div class="flex justify-between items-baseline gap-x-3 gap-y-1 mb-3">
										<!-- position -->
										{#if c.at !== null}
											<button
												type="button"
												class="cursor-pointer text-12px text-blue-300 underline underline-offset-4"
												onclick={() => seek(c.at ?? 0)}
												title="Go to this position"
											>
												<span class="i-ph-map-pin mr-1" aria-hidden="true"></span>{formatTime(
													c.at,
													1,
												)}
											</button>
										{/if}

										<!-- metadata -->
										<span class="text-12px opacity-70">
											{c.authorName} · {formatDate(c.createdAt)}
											{#if c.editedAt}<span class="ml-1 text-10px uppercase tracking-wider"
													>edited</span
												>{/if}
										</span>
									</div>

									<!-- title -->
									<h4 class="font-500 text-15px">{c.title}</h4>

									<!-- text -->
									<p class="whitespace-pre-line text-14px inline opacity-90">{c.body}</p>

									{#if canEditComment(c) || canDeleteComment(c)}
										<div class="mt-2 flex justify-end gap-3 text-12px text-blue-100">
											{#if canEditComment(c)}
												<button
													type="button"
													class="underline underline-offset-2 opacity-90 hover-text-accent hover-opacity-100"
													onclick={() => oneditcomment?.(c)}>Edit</button
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
													<button
														class="underline underline-offset-2 opacity-90 hover-text-accent hover-opacity-100"
														disabled={!!remove.pending}
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
					{canEdit
						? "No mixes yet. Upload the first bounce for the band to hear."
						: "No mixes yet."}
				</p>
			{/if}
		</div>
	</section>

	<!-- every mix, newest first -->
	{#if newestFirst.length > 1 || (mix && canEdit)}
		<section
			class="grid gap-1 relative bg-dark/70 border border-current/40 shadow rounded-md px-4 pt-4 pb-5"
			aria-label="All mixes"
		>
			<h3 class="text-12px tracking-wide text-blue-300 uppercase tracking-wider opacity-90 mb-2">
				All mixes
			</h3>
			<ul class="grid gap-3 sm-gap-1">
				{#each newestFirst as m (m.id)}
					<li>
						<button
							type="button"
							class="border border-current/40 sm-border-none flex flex-wrap w-full items-baseline gap-3 rounded px-2 py-1 text-left text-sm {m.id ===
							mix?.id
								? 'bg-blue-300/10'
								: 'hover-bg-white/5'}"
							aria-pressed={m.id === mix?.id}
							onclick={() => choose(m.id)}
						>
							<span class="tabular-nums opacity-70">v{m.version}</span>
							<span
								class="min-w-0 grow truncate {m.id === mix?.id
									? 'opacity-100 text-blue-100'
									: 'opacity-90'}">{m.label}</span
							>
							<span class="text-12px opacity-60 tabular-nums w-full sm-w-auto"
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
			<button class="button button-xs" type="button" onclick={pick}>
				<span class="i-ph-upload-simple" aria-hidden="true"></span>
				Upload New Mix
			</button>
		</div>
	{/if}
</section>
