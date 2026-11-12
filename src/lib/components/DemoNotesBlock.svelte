<script lang="ts">
	import DemoNotesEditor from "#lib/components/DemoNotesEditor.svelte";
	import RecordingNotes from "#lib/components/RecordingNotes.svelte";

	/**
	 * A demo's notes on its own page, under the header line: the text as
	 * typed (RecordingNotes) and, for an editor, Edit notes (Add notes while
	 * there are none), which opens the notes popover. Nothing for a viewer
	 * when there are no notes.
	 */
	interface Props {
		demo: { id: string; label: string; notes: string };
		canEdit: boolean;
	}
	let { demo, canEdit }: Props = $props();

	let editor = $state<DemoNotesEditor | null>(null);
</script>

{#if canEdit || demo.notes}
	<div class="-mt-2 mb-6 flex max-w-prose items-start gap-3">
		<RecordingNotes notes={demo.notes} class="min-w-0 grow" />
		{#if canEdit}
			<button type="button" class="button button-xs shrink-0" onclick={() => editor?.open(demo)}>
				<span class="i-ph-note-pencil" aria-hidden="true"></span>
				{demo.notes ? "Edit notes" : "Add notes"}
			</button>
			<DemoNotesEditor bind:this={editor} />
		{/if}
	</div>
{/if}
