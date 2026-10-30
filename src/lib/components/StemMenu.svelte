<script lang="ts">
	import ContextMenu from "#lib/components/ContextMenu.svelte";
	import type { StemState } from "#lib/audio/types.js";
	import { MIDI_ACCEPT } from "#lib/constants/midiFormats.js";
	import { STEM_ACCEPT } from "#lib/constants/stemFormats.js";
	import { STEM_TINTS } from "#lib/constants/stemTints.js";
	import { deleteStem, removeStemMidi } from "#lib/remote/songs.remote.js";
	import type { StemActions } from "#lib/state/stemActions.svelte.js";
	import { saveAs } from "#lib/upload.js";
	import { formatBytes } from "#lib/utils/formatBytes.js";
	import { formatKhz } from "#lib/utils/formatKhz.js";

	/** The database row behind a player stem: its file, size and MIDI file. */
	interface StemMenuRow {
		url: string;
		filename: string;
		sizeBytes: number;
		sampleRate: number | null;
		midiUrl: string | null;
		midiFilename: string | null;
	}

	/**
	 * A stem row's ⋯ menu on the song page: the file's details, the downloads,
	 * and for a member the MIDI file, Rename, the tint, Upload new version and
	 * Remove (docs/song-page.md, step 7).
	 */
	interface Props {
		stem: StemState;
		/** The stem's database row; no menu without one. */
		row: StemMenuRow | undefined;
		actions: StemActions;
		canEdit: boolean;
	}
	let { stem, row, actions, canEdit }: Props = $props();
	let job = $derived(actions.replacing[stem.id]);
	let remove = $derived(deleteStem.for(stem.id));
	let dropMidi = $derived(removeStemMidi.for(stem.id));
	let midi = $derived(actions.midiJobs[stem.id]);
</script>

{#if row}
	<!-- The menu as a ContextMenu (a native popover on the top layer, anchored to the button), so the next
	     row never covers it (Kevin); the body is one snippet item, as the Studio's track effects are. -->
	{#snippet stemMenuBody()}
		<div class="w-56 px-1 text-sm">
			{@render downloads(row)}
			{#if canEdit}
				{@render midiItems(row)}
				<button
					class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
					type="button"
					onclick={() => actions.rename(stem.id, stem.label)}
				>
					<span class="i-ph-pencil-simple mr-2" aria-hidden="true"></span>Rename
				</button>
				{@render tintGroup()}
				{@render fileItems()}
			{/if}
			{#if job?.error}<p class="px-3 py-1 text-xs text-red-400">{job.error}</p>{/if}
		</div>
	{/snippet}
	<ContextMenu
		ariaLabel="{stem.label}: options"
		title="{stem.label}: options"
		clearButtonBaseClasses={true}
		buttonClasses="device-fader-menu-button-sm"
		iconClass="i-ph-dots-three-bold"
		position="bottom left"
		popoverClasses="!max-h-[calc(100vh-2rem)] overflow-y-auto"
		items={[{ id: "stem", kind: "snippet", snippet: stemMenuBody }]}
	/>
{/if}

{#snippet downloads(row: StemMenuRow)}
	<div class="truncate px-3 py-1.5 text-xs text-dim">
		{row.filename} · {formatBytes(row.sizeBytes)}{row.sampleRate
			? ` · ${formatKhz(row.sampleRate)} kHz`
			: ""}
	</div>
	<button
		class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
		type="button"
		onclick={() => saveAs(row.url, row.filename)}
	>
		<span class="i-ph-download-simple mr-2" aria-hidden="true"></span>Download Stem
	</button>
	{#if row.midiUrl && row.midiFilename}
		<button
			class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
			type="button"
			onclick={() => saveAs(row.midiUrl ?? "", row.midiFilename ?? "stem.mid")}
		>
			<span class="i-ph-music-notes mr-2" aria-hidden="true"></span>Download MIDI
		</button>
	{/if}
{/snippet}

{#snippet midiItems(row: StemMenuRow)}
	<label class="block w-full cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10">
		<span class="i-ph-file-plus mr-2" aria-hidden="true"></span>{midi && !midi.error
			? `Uploading MIDI ${Math.round(midi.percent)}%`
			: row.midiUrl
				? "Replace MIDI"
				: "Upload MIDI"}
		<input
			class="sr-only"
			type="file"
			accept={MIDI_ACCEPT}
			disabled={!!midi && !midi.error}
			onchange={(e) => actions.uploadMidi(stem.id, e.currentTarget)}
		/>
	</label>
	{#if row.midiUrl}
		<form
			{...dropMidi.enhance(async ({ submit }) => {
				if (!confirm(`Remove the MIDI file for "${stem.label}"?`)) return;
				await submit();
			})}
		>
			<input {...dropMidi.fields.id.as("hidden", stem.id)} />
			<button
				class="block w-full rounded px-3 py-1.5 text-left hover:bg-white/10"
				disabled={!!dropMidi.pending}
			>
				<span class="i-ph-file-x mr-2" aria-hidden="true"></span>{dropMidi.pending
					? "Removing…"
					: "Remove MIDI"}
			</button>
		</form>
	{/if}
	{#if midi?.error}<p class="px-3 py-1 text-xs text-red-400">{midi.error}</p>{/if}
{/snippet}

{#snippet tintGroup()}
	<!-- The row's tint (constants/stemTints.ts): the palette as swatches, none first; shared with the song. -->
	<div class="px-3 py-1.5" role="group" aria-label="{stem.label}: tint">
		<div class="mb-1 text-xs text-dim">Tint</div>
		<div class="flex flex-wrap gap-1.5">
			<button
				type="button"
				class="h-5 w-5 rounded-full border {stem.tint
					? 'border-white/30 hover:border-white/70'
					: 'border-white ring-1 ring-white/60'} bg-blue-300/60"
				aria-label="No tint"
				aria-pressed={!stem.tint}
				title="No tint (the player's blue)"
				onclick={() => actions.tint(stem.id, null)}
			></button>
			{#each STEM_TINTS as t (t.id)}
				<button
					type="button"
					class="h-5 w-5 rounded-full border {stem.tint === t.id
						? 'border-white ring-1 ring-white/60'
						: 'border-white/30 hover:border-white/70'}"
					style:background-color={t.hex}
					aria-label="Tint {t.name}"
					aria-pressed={stem.tint === t.id}
					title={t.name}
					onclick={() => actions.tint(stem.id, t.id)}
				></button>
			{/each}
		</div>
	</div>
{/snippet}

{#snippet fileItems()}
	<label class="block w-full cursor-pointer rounded px-3 py-1.5 text-left hover:bg-white/10">
		<span class="i-ph-upload-simple mr-2" aria-hidden="true"></span>{job
			? job.stage === "uploading"
				? `Uploading ${Math.round(job.percent)}%`
				: job.stage
			: "Upload new version"}
		<input
			class="sr-only"
			type="file"
			accept={STEM_ACCEPT}
			disabled={!!job}
			onchange={(e) => actions.replace(stem.id, e.currentTarget)}
		/>
	</label>
	<form
		{...remove.enhance(async ({ submit }) => {
			if (!confirm(`Remove "${stem.label}" and its file?`)) return;
			await submit();
		})}
	>
		<input {...remove.fields.id.as("hidden", stem.id)} />
		<button
			class="block w-full rounded px-3 py-1.5 text-left text-red-400 hover:bg-white/10"
			disabled={!!remove.pending}
		>
			<span class="i-ph-trash mr-2" aria-hidden="true"></span>{remove.pending
				? "Removing…"
				: "Remove"}
		</button>
	</form>
{/snippet}
