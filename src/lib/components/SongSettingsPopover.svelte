<script lang="ts">
	import type { Snippet, ComponentProps } from "svelte";
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import type { BarGrid } from "#lib/audio/measures.js";
	import AiToggle from "#lib/components/AiToggle.svelte";
	import PrivacyToggle from "#lib/components/PrivacyToggle.svelte";
	import SongDetailsTab from "#lib/components/SongDetailsTab.svelte";
	import SongSectionsTab from "#lib/components/SongSectionsTab.svelte";
	import SongTempoKeyTab from "#lib/components/SongTempoKeyTab.svelte";
	import StageControl from "#lib/components/StageControl.svelte";
	import { DEMO_ACCEPT, MAX_DEMOS_PER_SONG } from "#lib/constants/demoFormats.js";
	import { deleteDemo, deleteSong } from "#lib/remote/songs.remote.js";
	import type { DemoUploads } from "#lib/state/demoUploads.svelte.js";
	import type { SongChanges } from "#lib/state/songChanges.svelte.js";
	import type { SongCheck } from "#lib/state/songCheck.svelte.js";
	import type { SongChordDraft } from "#lib/state/songChordDraft.svelte.js";
	import type { SongDetails } from "#lib/state/songDetails.svelte.js";
	import type { SongSections } from "#lib/state/songSections.svelte.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import type { SongStage } from "#lib/val/SongStageSchema.js";

	/** The settings popover shows one panel at a time (too much at once otherwise, and unusable on a phone). */
	const SETTINGS_TABS = [
		{ id: "details", label: "Details" },
		{ id: "sections", label: "Sections" },
		{ id: "tempo", label: "Tempo & key" },
		{ id: "demos", label: "Demos" },
		{ id: "options", label: "Options" },
	] as const;
	type SettingsTab = (typeof SETTINGS_TABS)[number]["id"];

	/**
	 * Song settings: a native popover (`#song-settings`, opened by the page's
	 * gear with `popovertarget`) of five tabs, Details, Sections, Tempo & key,
	 * Demos and Options. The state is the page's (the classes in src/lib/state);
	 * the tab shown is this component's, and the page moves it with `showTab`.
	 */
	interface Props {
		details: SongDetails;
		sections: SongSections;
		changes: SongChanges;
		chordDraft: SongChordDraft;
		check: SongCheck;
		demos: DemoUploads;
		/** The song as saved: what the Details tab reads, its demos, stage and switches. */
		song: ComponentProps<typeof SongDetailsTab>["song"] & {
			stage: SongStage | null;
			noAi: boolean;
			isPrivate: boolean;
			project: { noAi: boolean; isPrivate: boolean };
			demos: {
				id: string;
				label: string;
				sizeBytes: number;
				status: string;
				playbackStatus: string | null;
			}[];
		};
		/** The account's artist directory, for the credits picker. */
		artists: { id: string; name: string }[];
		accountSlug: string;
		/** The Stem Player's engine, for the Playhead buttons and the scans. */
		engine: StemEngine | null;
		/** The bar grid, for the Tempo & key tab's snapping. */
		grid: BarGrid | null;
		hasScore: boolean;
		aiAvailable: boolean;
		/** The account's or project's AI switch is off. */
		noAi: boolean;
		canEdit: boolean;
		/** A notation PDF has a chart read to review. */
		canReview: boolean;
		/** Open the chart read for correction. */
		onreview: () => void;
		/** The song's stage as set, or read from what it holds. */
		stage: SongStage;
		/** The chart draft card, shared with the Docs panel. */
		draftCard: Snippet;
	}

	let {
		details,
		sections,
		changes,
		chordDraft,
		check,
		demos,
		song,
		artists,
		accountSlug,
		engine,
		grid,
		hasScore,
		aiAvailable,
		noAi,
		canEdit,
		canReview,
		onreview,
		stage,
		draftCard,
	}: Props = $props();

	let settingsPanel = $state<HTMLDivElement | null>(null);
	let settingsTab = $state<SettingsTab>("details");
	/** The phone's settings panel picker (a <details>), closed like the other menus. */
	let settingsNavEl = $state<HTMLDetailsElement | null>(null);
	const settingsTabLabel = $derived(
		SETTINGS_TABS.find((t) => t.id === settingsTab)?.label ?? "Details",
	);

	/** Show a tab (the song check moves to Tempo & key when its answer arrives). */
	export function showTab(id: SettingsTab) {
		settingsTab = id;
	}
</script>

<svelte:window
	onpointerdown={(e) => {
		if (settingsNavEl?.open && !settingsNavEl.contains(e.target as Node))
			settingsNavEl.open = false;
	}}
/>

{#snippet phoneNav()}
	<details class="relative shrink-0 sm:hidden" bind:this={settingsNavEl}>
		<summary
			class="button button-sm flex items-center gap-2 list-none [&::-webkit-details-marker]:hidden"
			aria-label="Settings panel"
		>
			{settingsTabLabel}
			<span class="i-ph-caret-down text-10px" aria-hidden="true"></span>
		</summary>
		<div
			class="absolute top-full left-0 z-20 mt-1 min-w-44 rounded border border-white/15 bg-oxford p-1 text-sm shadow-lg"
			role="menu"
		>
			{#each SETTINGS_TABS as tab (tab.id)}
				<button
					class="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/10"
					type="button"
					role="menuitemradio"
					aria-checked={settingsTab === tab.id}
					onclick={() => {
						if (settingsNavEl) settingsNavEl.open = false;
						settingsTab = tab.id;
					}}
				>
					<span class="i-ph-check {settingsTab === tab.id ? '' : 'invisible'}" aria-hidden="true"
					></span>{tab.label}
				</button>
			{/each}
		</div>
	</details>
{/snippet}

{#snippet desktopNav()}
	<nav class="hidden shrink-0 sm:flex sm:w-44 sm:flex-col sm:gap-y-1" aria-label="Settings panels">
		{#each SETTINGS_TABS as tab (tab.id)}
			<button
				type="button"
				class="button button-sm justify-start whitespace-nowrap text-left {settingsTab === tab.id
					? 'bg-blue-300 text-oxford border-blue-300 hover-bg-blue-200 hover-border-blue-200'
					: 'opacity-80 border-transparent hover-bg-blue-200 hover-border-blue-200'}"
				aria-current={settingsTab === tab.id ? "page" : undefined}
				onclick={() => (settingsTab = tab.id)}>{tab.label}</button
			>
		{/each}
	</nav>
{/snippet}

{#snippet demoList()}
	{#if song.demos.length > 0}
		<ul class="mt-3 grid gap-1">
			{#each song.demos as d (d.id)}
				{@const remove = deleteDemo.for(d.id)}
				<li
					class="flex items-center justify-between gap-3 rounded-md border border-white/10 px-3 bg-black/5 py-2 text-sm shadow"
				>
					<span class="min-w-0 truncate">
						{d.label}
						<span class="opacity-90"
							>· {formatBytes(d.sizeBytes)}{#if d.status !== "ready"}
								· uploading{:else if d.playbackStatus !== "ready"}
								· converting to MP3…{/if}</span
						>
						<form
							{...remove.enhance(async ({ submit }) => {
								if (!confirm(`Remove the demo "${d.label}"?`)) return;
								await submit();
							})}
						>
							<input {...remove.fields.id.as("hidden", d.id)} />
							<button class="link text-xs" disabled={!!remove.pending}>
								{remove.pending ? "Removing…" : "Remove"}
							</button>
						</form>
					</span>
				</li>
			{/each}
		</ul>
	{:else}
		<p
			class="mt-3 rounded border border-dashed border-white/15 px-3 py-4 text-center text-sm opacity-90"
		>
			No demos yet.
		</p>
	{/if}
{/snippet}

{#snippet demosTab()}
	<div>
		<h3 class="text-15px font-700">Demo recordings</h3>
		<p class="mt-1 text-sm opacity-90">
			Phone memos, rough takes, the original idea — any audio format; each is converted to MP3 for
			listening and download. Up to {MAX_DEMOS_PER_SONG}.
		</p>
		{#if demos.notice}
			<p class="mt-2 text-sm text-red-400" role="alert">{demos.notice}</p>
		{/if}
		{#each demos.jobs as job (job.name)}
			<p class="mt-2 text-sm {job.error ? 'text-red-400' : 'opacity-90'}">
				{job.name}: {job.error ?? `${job.percent.toFixed(0)}%`}
			</p>
		{/each}
		{@render demoList()}
		<div class="mt-3">
			<label
				class="button button-sm lg-button-xs cursor-pointer {demos.busy
					? 'opacity-50 pointer-events-none'
					: ''}"
			>
				<span class="i-ph-plus" aria-hidden="true"></span>
				{demos.busy ? "Uploading…" : "Upload demo"}
				<input
					class="sr-only"
					type="file"
					accept={DEMO_ACCEPT}
					multiple
					disabled={demos.busy}
					onchange={(e) => demos.upload(e.currentTarget)}
				/>
			</label>
		</div>
	</div>
{/snippet}

{#snippet optionsTab()}
	<div>
		<StageControl id={song.id} stage={song.stage} effective={stage} canChange={canEdit} />
	</div>
	<div class="mt-8 border-t border-white/15 pt-4">
		<AiToggle
			kind="song"
			id={song.id}
			noAi={song.noAi}
			inherited={song.project.noAi}
			canChange={canEdit}
		/>
	</div>
	<div class="mt-8 border-t border-white/15 pt-4">
		<PrivacyToggle
			kind="song"
			id={song.id}
			isPrivate={song.isPrivate}
			inherited={song.project.isPrivate}
			canChange={canEdit}
		/>
	</div>
	<div class="mt-8 border-t border-white/15 pt-4">
		<h3 class="text-15px font-700 text-red-400">Delete this song</h3>
		<p class="mt-1 text-sm opacity-90">
			Removes the song, its chart, lyrics and notes, every stem file and every demo recording.
		</p>
		<form
			class="mt-3"
			{...deleteSong.enhance(async ({ submit }) => {
				if (!confirm(`Delete "${song.title}" and all of its stems?`)) return;
				await submit();
			})}
		>
			<input {...deleteSong.fields.id.as("hidden", song.id)} />
			<button
				class="button text-red-400 hover-bg-red-400 hover-text-oxford"
				disabled={!!deleteSong.pending}
			>
				<span class="i-ph-trash" aria-hidden="true"></span>
				{deleteSong.pending ? "Deleting…" : "Delete song"}
			</button>
		</form>
	</div>
{/snippet}

<!-- Settings as a native popover: top layer, light-dismiss, Esc closes. On a phone it fills the
     dynamic viewport (h-dvh, as the recorder's sheets do): 100% of a fixed box is the layout
     viewport on iOS, taller than what shows with the address bar, and the top got cut off. -->
<div
	id="song-settings"
	popover="auto"
	onbeforetoggle={(e) => {
		if (e.newState === "open") {
			details.reset(); // saved values, not the last edit
			sections.reset();
			changes.reset();
		}
	}}
	bind:this={settingsPanel}
	class="[&:popover-open]:flex m-0 h-dvh max-h-none w-screen max-w-none flex-col overflow-y-auto bg-oxford p-4 text-neutral-100 sm:m-auto sm:h-[min(46rem,calc(100dvh-2rem))] sm:w-[min(58rem,calc(100vw-2rem))] sm:rounded-md sm:border sm:border-white/15 sm:p-6 sm:shadow-2xl sm:shadow-black/60 [&::backdrop]:bg-black/60"
>
	<div class="mb-4 flex shrink-0 items-center justify-between gap-4">
		<h2 class="heading-2 mb-0">Song settings</h2>
		<button
			class="button button-xs"
			type="button"
			popovertarget="song-settings"
			popovertargetaction="hide"
		>
			Close
		</button>
	</div>
	<!-- One panel at a time: a dropdown on a phone, a column beside the panel from sm up. -->
	<div class="flex min-h-0 flex-1 flex-col gap-4 sm:flex-row sm:gap-8">
		{@render phoneNav()}
		{@render desktopNav()}
		<div class="min-h-0 flex-1 overflow-y-auto sm:pr-2">
			{#if settingsTab === "details"}
				<SongDetailsTab
					{details}
					{changes}
					{song}
					{artists}
					{accountSlug}
					{engine}
					onsaved={() => settingsPanel?.hidePopover()}
				/>
			{/if}
			{#if settingsTab === "sections"}
				<SongSectionsTab {sections} {changes} {hasScore} {aiAvailable} />
			{/if}
			{#if settingsTab === "tempo"}
				<SongTempoKeyTab
					{changes}
					{chordDraft}
					{check}
					{engine}
					{grid}
					{hasScore}
					{aiAvailable}
					{noAi}
					{canReview}
					{onreview}
					{draftCard}
				/>
			{/if}
			{#if settingsTab === "demos"}
				{@render demosTab()}
			{/if}
			{#if settingsTab === "options"}
				{@render optionsTab()}
			{/if}
		</div>
	</div>
</div>
