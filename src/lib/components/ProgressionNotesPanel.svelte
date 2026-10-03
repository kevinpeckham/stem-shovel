<script lang="ts">
	import { progressionPad } from "$lib/audio/progression.svelte";
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { saveProgression, saveProgressionNotes } from "$lib/remote/progressions.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";

	/**
	 * The chord player's note board (docs/chord-player.md, "Notes"): the
	 * Idea Recorder's editor, autosaving on idle, kept with the pad in the
	 * browser and saved with the progression. A signed-in editor's first
	 * note on a pad that was never saved creates the progression (named
	 * from the pad, or untitled), so notes can stand alone; emptying the
	 * notes of a progression without chords removes it again, as an idea.
	 */
	interface Props {
		account: { id: string; name: string; canEdit: boolean };
		/** After a row is created, renamed or removed by a save, so the page's list follows. */
		onrow?: (
			change:
				| { kind: "created"; row: { id: string; name: string; updatedAt: Date } }
				| { kind: "deleted"; id: string },
		) => void;
	}
	let { account, onrow }: Props = $props();
	const pad = progressionPad;

	let editor = $state<MarkdownEditorState | null>(null);
	let pending = $state(false);
	let saveError = $state<string | null>(null);
	let version = $state(0);

	async function save() {
		if (!editor || pending) return;
		const sent = editor.markdownCurrent;
		pending = true;
		saveError = null;
		try {
			pad.setNotes(sent);
			if (account.canEdit) {
				if (pad.savedId) {
					const r = await saveProgressionNotes({ id: pad.savedId, markdown: sent });
					if (r.deleted) {
						const id = pad.savedId;
						pad.detach(id);
						onrow?.({ kind: "deleted", id });
					}
				} else if (sent.trim()) {
					const row = await saveProgression({
						accountId: account.id,
						name: pad.name || "Untitled progression",
						data: $state.snapshot(pad.data),
						notes: sent,
					});
					pad.saved({ id: row.id, name: row.name });
					onrow?.({
						kind: "created",
						row: { id: row.id, name: row.name, updatedAt: new Date(row.updatedAt) },
					});
				}
			}
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

<div
	class="grid gap-2 grid-cols-1 place-content-[start_stretch] h-full min-h-300px max-w-full grid-rows-1fr rounded-md overflow-x-hidden"
>
	<div
		class="h-full min-h-full max-h-full overflow-y-auto w-full max-w-full overflow-x-hidden pt-0"
	>
		{#key pad.notesKey}
			<MarkdownDocEditor
				bind:editor
				markdown={pad.notes}
				docKey="progression-notes"
				label="Notes"
				hint=""
				backHref=""
				backLabel=""
				{version}
				{pending}
				confirmEmpty={false}
				{saveError}
				mode="embedded"
				view="markdown"
				onsave={() => void save()}
				onclose={() => {
					if (editor?.hasEdits) void save();
				}}
			/>
		{/key}
	</div>
	<div class="absolute top-2 right-12 flex items-center gap-2">
		{#if pending}
			<span class="i-ph-circle-notch animate-spin opacity-80" aria-hidden="true"></span>
		{/if}
	</div>
</div>
