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
	/** The phone's document picker (a <details>): closed on a choice, a click elsewhere or Escape. */
	let pickerEl = $state<HTMLDetailsElement | null>(null);
	function closePicker(e: Event) {
		if (pickerEl?.open && !(e.type === "pointerdown" && pickerEl.contains(e.target as Node))) {
			pickerEl.open = false;
		}
	}
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

<svelte:window
	onpointerdown={closePicker}
	onkeydown={(e) => {
		if (e.key === "Escape") closePicker(e);
	}}
/>

<div class="grid gap-2 grid-cols-1 place-content-[start_stretch] max-w-full relative min-h-600px">
	{#if panel === "comments"}
		<div
			class="h-full min-h-64 max-h-[70vh] overflow-y-auto bg-blue-300/5 border rounded-md border-current/40 px-6 pt-12 pb-8"
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
		<!-- A dropdown on a phone (our own, so it opens downward), the segmented control from sm up. -->
		<details class="relative sm:hidden" bind:this={pickerEl}>
			<summary
				class="button button-xs flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden"
				aria-label="Document"
			>
				{LABELS[panel]}
				<span class="i-ph-caret-down text-10px" aria-hidden="true"></span>
			</summary>
			<div
				class="absolute top-full left-0 z-20 mt-1 min-w-40 rounded border border-white/15 bg-oxford p-1 text-sm shadow-lg"
				role="menu"
			>
				{#each PANELS as kind (kind)}
					<button
						class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/10"
						type="button"
						role="menuitemradio"
						aria-checked={panel === kind}
						onclick={() => {
							if (pickerEl) pickerEl.open = false;
							panel = kind;
						}}
					>
						<span class="i-ph-check {panel === kind ? '' : 'invisible'}" aria-hidden="true"
						></span>{LABELS[kind]}
					</button>
				{/each}
			</div>
		</details>
		<div
			class="hidden overflow-hidden rounded border border-white/15 items-center sm:flex"
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
