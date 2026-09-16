<script lang="ts">
	import SongDocPanel from "$lib/components/SongDocPanel.svelte";
	import type { DemoComment } from "$lib/constants/demoComments";
	import type { SongView } from "$lib/server/songView";
	import { formatDate } from "$lib/utils/formatDate";
	import { formatTime } from "$lib/utils/formatTime";

	/**
	 * The song page's documents panel for a visitor, as the home page's
	 * second demo: the chart, lyrics and notes as members wrote them, and the
	 * comments. Read-only; the song page has the editing.
	 */
	interface Props {
		view: SongView;
		href: string;
		/** The demo's comments (examples plus the visitor's own), shared with the player demo. */
		comments: DemoComment[];
		onremove?: (id: string) => void;
	}
	let { view, href, comments, onremove }: Props = $props();
	const PANELS = ["chart", "lyrics", "notes", "comments"] as const;
	type Panel = (typeof PANELS)[number];
	const LABELS: Record<Panel, string> = {
		chart: "Chart",
		lyrics: "Lyrics",
		notes: "Notes",
		comments: "Comments",
	};
	let panel = $state<Panel>("chart");
	let song = $derived(view.song);
	let doc = $derived(panel === "comments" ? "chart" : panel);
	const DOC_TEXT = $derived({
		chart: song.chartMarkdown,
		lyrics: song.lyricsMarkdown,
		notes: song.notesMarkdown,
	});
	const DOC_VERSION = $derived({
		chart: song.chartVersion,
		lyrics: song.lyricsVersion,
		notes: song.notesVersion,
	});
</script>

<div
	class="grid gap-2 grid-cols-1 place-content-[start_stretch] max-w-full overflow-hidden relative"
>
	{#if panel === "comments"}
		<div
			class="min-h-64 max-h-[70vh] overflow-y-auto bg-blue-300/5 border rounded-md border-current/40 px-6 pt-12 pb-8"
		>
			<p class="mb-3 text-13px opacity-70">
				Example comments. Add your own from the player above (⌘-click or right-click a waveform); on
				the demo they live on this page only.
			</p>
			{#if comments.length === 0}
				<p class="opacity-80">No comments yet.</p>
			{:else}
				<ol class="grid gap-4">
					{#each comments as c (c.id)}
						<li class="rounded-md border border-white/10 bg-black/20 px-4 py-3">
							<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
								<h3 class="font-600">{c.title}</h3>
								<span class="text-12px opacity-70">{c.authorName} · {formatDate(c.createdAt)}</span>
							</div>
							{#if c.at !== null}
								<p class="mt-1 text-12px opacity-70">
									<span class="i-ph-map-pin mr-1 inline-block align-[-2px]" aria-hidden="true"
									></span>{formatTime(c.at)}
								</p>
							{/if}
							<p class="mt-2 whitespace-pre-line text-15px">{c.body}</p>
							{#if c.mine && onremove}
								<button type="button" class="mt-2 text-12px link-dim" onclick={() => onremove(c.id)}
									>Delete</button
								>
							{/if}
						</li>
					{/each}
				</ol>
			{/if}
		</div>
	{:else}
		{#key doc}
			<SongDocPanel
				songId={song.id}
				kind={doc}
				label={LABELS[doc]}
				hint=""
				markdown={DOC_TEXT[doc]}
				html={view.docs[doc]}
				version={DOC_VERSION[doc]}
				canEdit={false}
			/>
		{/key}
	{/if}
	<div class="absolute top-2 right-3 flex items-stretch gap-4">
		<div
			class="flex overflow-hidden rounded border border-white/15 items-center"
			role="tablist"
			aria-label="Document"
		>
			{#each PANELS as kind, index (kind)}
				<button
					type="button"
					role="tab"
					aria-selected={panel === kind}
					class="{panel === kind
						? 'button button-xs bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
						: 'button button-xs opacity-80 hover-bg-blue-200 hover-border-blue-200'} {index === 0
						? 'rounded-r-none border-r-none'
						: index === PANELS.length - 1
							? 'rounded-l-none'
							: 'rounded-none border-r-none'}"
					onclick={() => (panel = kind)}>{LABELS[kind]}</button
				>
			{/each}
		</div>
		<a class="button button-xs flex items-center" {href} title="Open the song page">
			<span class="i-ph-arrow-square-out" aria-hidden="true"></span>
		</a>
	</div>
</div>
