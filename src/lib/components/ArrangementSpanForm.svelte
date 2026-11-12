<script lang="ts">
	import type { StemEngine } from "#lib/audio/engine.svelte.js";
	import PositionEntry from "#lib/components/PositionEntry.svelte";
	import { saveArrangementSpan } from "#lib/remote/arrangements.remote.js";
	import { notify } from "#lib/state/notifications.svelte.js";
	import type { SongChanges } from "#lib/state/songChanges.svelte.js";
	import { SpanEntries, type SavedSpan } from "#lib/state/spanEntries.svelte.js";
	import { clearForm } from "#lib/utils/clearForm.js";

	/**
	 * An alternate arrangement's own start of bar 1 and end (docs/arrangements.md,
	 * "Settings of its own"), in the Tempo & key tab: the song's settings form
	 * carries the song's, so an alternate's are saved here, on the
	 * `saveArrangementSpan` remote form. The first save gives the alternate
	 * settings of its own.
	 */
	interface Props {
		arrangementId: string;
		/** The start and end in force for the arrangement (the song's while it inherits). */
		span: SavedSpan;
		/** The position helpers every editor shares (editPos, rowSeconds, the readout mode). */
		changes: SongChanges;
		/** The Stem Player's engine, for the Playhead buttons. */
		engine: StemEngine | null;
	}

	let { arrangementId, span, changes, engine }: Props = $props();

	const entries = new SpanEntries(
		() => span,
		() => changes,
	);
	// The tab mounts this each time it opens: the entries start as saved.
	entries.resetEntries();
	const fields = saveArrangementSpan.fields;
</script>

<form
	class="mt-5 border-t border-current/20 pt-3"
	aria-label="Arrangement start and end"
	data-arrangement-span
	{...saveArrangementSpan.enhance(async ({ submit, element }) => {
		if (!entries.preparePositions()) return;
		// The form remembers its last values for the page's life (CLAUDE.md): the arrangement is set at submit.
		fields.id.set(arrangementId);
		if (!(await submit())) return;
		clearForm(saveArrangementSpan, element);
		entries.resetEntries();
		notify("Arrangement start and end saved");
	})}
>
	<h3 class="text-15px font-700">Start and end</h3>
	<input {...fields.id.as("hidden", arrangementId)} />
	<div class="mt-2 grid gap-4 sm:grid-cols-2">
		<PositionEntry
			label="Start of bar 1"
			hint="Leading silence or a count-in in this arrangement's stems: bars are counted from here."
			{entries}
			entry="startAtEntry"
			hidden={fields.startAt.as("hidden", entries.positionValue("startAtEntry"))}
			issues={fields.startAt.issues()}
			{changes}
			{engine}
		/>
		<PositionEntry
			label="End"
			hint="Where this arrangement ends, for the bars total."
			{entries}
			entry="endAtEntry"
			hidden={fields.endAt.as("hidden", entries.positionValue("endAtEntry"))}
			issues={fields.endAt.issues()}
			{changes}
			{engine}
		/>
	</div>
	{#if entries.positionError}
		<p class="mt-2 text-sm text-red-400" role="alert">{entries.positionError}</p>
	{/if}
	<button
		class="mt-3 button-accent disabled:opacity-40"
		disabled={!entries.spanDirty || !!saveArrangementSpan.pending}
	>
		{saveArrangementSpan.pending ? "Saving…" : "Save start and end"}
	</button>
</form>
