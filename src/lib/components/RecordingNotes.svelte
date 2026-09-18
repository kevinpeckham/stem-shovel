<script lang="ts">
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { saveRecordingNotes } from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";

	/**
	 * Notes on an idea, in the same embedded markdown editor the song
	 * documents use (autosave on idle and ⌘S). Always in edit mode: an
	 * idea's notes are a scratchpad, not a published document. Before the
	 * recording exists (the recorder page, notes jotted ahead of a take) the
	 * editor keeps a draft the page hands to the save; once there is an id,
	 * every autosave goes to the server.
	 */
	interface Props {
		recording: { id: string | null; notes: string };
		/** Identity for the editor: it re-seeds from `notes` only when this changes. */
		docKey?: string;
		/** Receives the draft on every autosave while there is no recording yet. */
		ondraft?: (markdown: string) => void;
		/** Compact framing for a list row. */
		compact?: boolean;
		/** Fill the parent's box instead of drawing its own (the recorder page's panel). */
		panel?: boolean;
	}
	let { recording, docKey, ondraft, compact = false, panel = false }: Props = $props();

	let editor = $state<MarkdownEditorState | null>(null);
	let pending = $state(false);
	let saveError = $state<string | null>(null);
	let version = $state(0);
	let view = $state<"rendered" | "markdown">("rendered");

	async function save() {
		if (!editor || pending) return;
		const sent = editor.markdownCurrent;
		if (!recording.id) {
			ondraft?.(sent);
			editor.markAsSaved();
			version++;
			return;
		}
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

<div class="grid gap-2 {panel ? 'h-full grid-rows-[auto_1fr]' : ''}">
	<div class="flex items-center justify-between gap-3">
		<h3 class="text-15px font-700">Notes</h3>
		<div class="flex items-center gap-2 text-12px opacity-80">
			{#if pending}<span>Saving…</span>{:else if editor?.hasEdits}<span>Unsaved</span
				>{:else if !recording.id && recording.notes.trim()}<span>Saved with the next take</span
				>{/if}
			<button
				class="link-dim"
				type="button"
				onclick={() => (view = view === "rendered" ? "markdown" : "rendered")}
				>{view === "rendered" ? "Markdown" : "Rich Text"}</button
			>
		</div>
	</div>
	<div
		class="bg-blue-300/5 border rounded-md border-current/40 px-4 pt-3 pb-4 overflow-y-auto {panel
			? 'min-h-0 max-h-[70vh]'
			: compact
				? 'min-h-32 max-h-64'
				: 'min-h-48 max-h-[50vh]'}"
	>
		<MarkdownDocEditor
			bind:editor
			markdown={recording.notes}
			docKey={docKey ?? `recording/${recording.id ?? "draft"}`}
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
