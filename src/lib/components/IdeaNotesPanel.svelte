<script lang="ts">
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { saveIdeaNotes } from "$lib/remote/ideas.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";

	/**
	 * An idea's note board: the song documents' embedded markdown editor,
	 * always in edit mode and always the markdown view, autosaving on idle
	 * (Escape or ⌘S save at once). A trash button clears the notes. The idea
	 * is created on the first save when the page has none yet (`ensureIdea`).
	 */
	interface Props {
		idea: { id: string | null; notes: string };
		/** The idea's id, creating the idea if there is none yet. */
		ensureIdea: () => Promise<string>;
		/** Receives the notes after every save, so the page keeps its copy current. */
		onchange?: (markdown: string) => void;
		/** The trash button, after the confirm. */
		onclear?: () => void;
	}
	let { idea, ensureIdea, onchange, onclear }: Props = $props();

	let editor = $state<MarkdownEditorState | null>(null);
	let pending = $state(false);
	let saveError = $state<string | null>(null);
	let version = $state(0);

	const current = () => editor?.markdownCurrent ?? idea.notes;

	async function save() {
		if (!editor || pending) return;
		const sent = editor.markdownCurrent;
		pending = true;
		saveError = null;
		try {
			const id = idea.id ?? (await ensureIdea());
			await saveIdeaNotes({ id, markdown: sent });
			if (editor.markdownCurrent === sent) editor.markAsSaved();
			version++;
			onchange?.(sent);
		} catch (e) {
			saveError = errorMessage(e);
			notify(`Notes not saved: ${saveError}`, { kind: "error" });
		} finally {
			pending = false;
		}
	}
</script>

<div
	class="grid gap-2 grid-cols-1 place-content-[start_stretch] h-full min-h-300px h-400px max-w-full grid-rows-1fr relative"
>
	<div
		class="h-full min-h-full max-h-[70vh] overflow-y-auto bg-black/40 border rounded-md border-current/40 px-6 pt-4 pb-4"
	>
		<MarkdownDocEditor
			bind:editor
			markdown={current()}
			docKey="idea-notes"
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
	</div>

	<div class="absolute top-2 right-3 flex items-center gap-2">
		{#if pending}
			<span class="i-ph-circle-notch animate-spin text-sm opacity-70" aria-hidden="true"></span>
		{/if}
		<button
			class="px-2 py-2 bg-blue-300/5 hover-text-red-600 hover-bg-red-600/10 opacity-80 rounded-md flex items-center disabled-opacity-80 border border-blue-300/5 hover-border-current"
			type="button"
			title="Clear the notes"
			aria-label="Clear the notes"
			disabled={!current().trim()}
			onclick={() => {
				if (confirm("Clear the notes?")) onclear?.();
			}}
		>
			<span class="i-ph-trash" aria-hidden="true"></span>
		</button>
	</div>
</div>
