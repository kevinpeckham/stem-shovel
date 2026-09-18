<script lang="ts">
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { saveRecordingNotes } from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";

	/**
	 * Notes on a scratch recording, in the same embedded markdown editor the
	 * song documents use (autosave on idle and ⌘S). Always in edit mode: an
	 * idea's notes are a scratchpad, not a published document.
	 */
	interface Props {
		recording: { id: string; notes: string };
		/** Compact framing for a list row. */
		compact?: boolean;
	}
	let { recording, compact = false }: Props = $props();

	let editor = $state<MarkdownEditorState | null>(null);
	let pending = $state(false);
	let saveError = $state<string | null>(null);
	let version = $state(0);
	let view = $state<"rendered" | "markdown">("rendered");

	async function save() {
		if (!editor || pending) return;
		const sent = editor.markdownCurrent;
		pending = true;
		saveError = null;
		try {
			await saveRecordingNotes({ id: recording.id, markdown: sent });
			if (editor.markdownCurrent === sent) editor.markAsSaved();
			version++;
		} catch (e) {
			saveError = errorMessage(e);
			notify(`Notes not saved: ${saveError}`, { kind: "error" });
		} finally {
			pending = false;
		}
	}
</script>

<div class="grid gap-2">
	<div class="flex items-center justify-between gap-3">
		<h3 class="text-15px font-700">Notes</h3>
		<div class="flex items-center gap-2 text-12px opacity-80">
			{#if pending}<span>Saving…</span>{:else if editor?.hasEdits}<span>Unsaved</span>{/if}
			<button
				class="link-dim"
				type="button"
				onclick={() => (view = view === "rendered" ? "markdown" : "rendered")}
				>{view === "rendered" ? "Markdown" : "Rich Text"}</button
			>
		</div>
	</div>
	<div
		class="bg-blue-300/5 border rounded-md border-current/40 px-4 pt-3 pb-4 {compact
			? 'min-h-32 max-h-64'
			: 'min-h-48 max-h-[50vh]'} overflow-y-auto"
	>
		<MarkdownDocEditor
			bind:editor
			markdown={recording.notes}
			docKey="recording/{recording.id}"
			label="Notes"
			hint=""
			backHref=""
			backLabel=""
			{version}
			{pending}
			confirmEmpty={false}
			{saveError}
			mode="embedded"
			{view}
			onsave={() => void save()}
		/>
	</div>
</div>
