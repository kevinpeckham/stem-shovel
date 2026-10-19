<script lang="ts">
	import CommentTimeline from "#lib/components/CommentTimeline.svelte";
	import { formatTime } from "#lib/utils/formatTime.js";
	import type { Snippet } from "svelte";

	/**
	 * One recording under review (docs/uploads-and-blob.md, "Sessions"
	 * review): its waveform with the playhead and a bubble at each located
	 * comment (CommentTimeline; a click seeks, ⌘-click, Ctrl-click or
	 * right-click asks the page for its menu), then the comments in a list,
	 * each drawn by the page's `card` snippet (so the page's forms edit and
	 * delete with its permissions). The Sessions page shows one under a
	 * session's recording and the song page's Demos view one under the
	 * demo that plays. The peaks come measured from the server
	 * (`pcm16Peaks`); until they are there the row says so.
	 */
	export interface ReviewComment {
		id: string;
		title: string;
		at: number | null;
	}
	interface Props {
		/** The recording's name, for the labels. */
		label: string;
		/** 1024 peaks in 0..1; null while the server is still measuring them. */
		peaks: number[] | null;
		/** The recording's length in seconds (the player's once it knows, else the row's). */
		duration: number;
		/** The playhead, in seconds; 0 when this recording is not the one playing. */
		position: number;
		comments: ReviewComment[];
		canComment?: boolean;
		card: Snippet<[string]>;
		onseek: (seconds: number) => void;
		/** Add a comment about the recording in general (the heading's button). */
		oncomment?: () => void;
		/** ⌘-click, Ctrl-click or right-click on the waveform: the page's menu (Seek here, Comment here). */
		oncontext?: (seconds: number, x: number, y: number) => void;
		/** The list's heading; "Comments" by default. */
		heading?: string;
	}
	let {
		label,
		peaks,
		duration,
		position,
		comments,
		canComment = false,
		card,
		onseek,
		oncomment,
		oncontext,
		heading = "Comments",
	}: Props = $props();

	let located = $derived(
		comments.filter((c) => c.at !== null).toSorted((a, b) => (a.at ?? 0) - (b.at ?? 0)) as {
			id: string;
			title: string;
			at: number;
		}[],
	);
	/** What the Comments row needs of this player (CommentTimeline's TimelineSource). */
	let source = $derived({
		get duration() {
			return duration;
		},
		get position() {
			return position;
		},
		get mixPeaks() {
			return peaks ?? [];
		},
		stems: [] as { peaks: number[]; duration: number }[],
		seek: onseek,
	});
</script>

<div class="grid gap-3" data-recording-review>
	<div class="relative rounded bg-blue-300/5">
		<CommentTimeline
			dimWaveform={false}
			engine={source}
			comments={located}
			heading=""
			{card}
			{canComment}
			{oncontext}
			showTip={false}
		/>
		{#if !peaks}
			<p
				class="pointer-events-none absolute inset-0 grid place-items-center text-12px opacity-80"
				aria-live="polite"
			>
				<span class="rounded bg-oxford/85 px-2 py-1">The waveform is on its way…</span>
			</p>
		{/if}
		<span class="absolute right-2 bottom-0 text-10px tabular-nums opacity-80"
			>{formatTime(duration)}</span
		>
	</div>
	<section class="grid gap-2" aria-label="{heading} on {label}">
		<div class="flex items-baseline justify-between gap-3">
			<h3 class="text-12px uppercase tracking-wider text-blue-300 opacity-90">
				{comments.length ? `${heading} (${comments.length})` : heading}
			</h3>
			{#if canComment && oncomment}
				<button
					type="button"
					class="flex h-4 w-4 items-center justify-center rounded bg-blue-300/5 text-11px opacity-90 hover-bg-blue-300/15 hover-text-accent hover-opacity-100"
					title="Comment on {label}"
					aria-label="Add comment on {label}"
					onclick={oncomment}><span class="i-ph-pencil"></span></button
				>
			{/if}
		</div>
		{#if comments.length === 0}
			<p class="text-13px opacity-80">
				{canComment
					? "No comments yet. ⌘-click (Ctrl-click) or right-click the waveform to leave one at that spot."
					: "No comments yet."}
			</p>
		{:else}
			<ol class="grid gap-2">
				{#each comments as c (c.id)}
					<li
						class="rounded-md border border-white/10 bg-light/10 px-3 py-2 text-sm"
						data-review-comment={c.id}
					>
						{@render card(c.id)}
					</li>
				{/each}
			</ol>
		{/if}
	</section>
</div>
