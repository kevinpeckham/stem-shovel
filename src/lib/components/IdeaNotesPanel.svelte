<script lang="ts">
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { saveIdeaNotes } from "$lib/remote/ideas.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";

	/**
	 * An idea's note board: the song documents' embedded markdown editor,
	 * always in edit mode and always the markdown view, autosaving on idle
	 * (Escape or ⌘S save at once; an emptied board saves too). The idea is
	 * created on the first save when the page has none yet (`ensureIdea`).
	 */
	interface Props {
		idea: { id: string | null; notes: string; title?: string };
		/** The idea's id, creating the idea if there is none yet. */
		ensureIdea: () => Promise<string>;
		/** Receives the notes after every save, so the page keeps its copy current. */
		onchange?: (markdown: string) => void;
		/** After every save: whether emptying the notes removed the idea (it had no takes), so the page drops its id and refreshes its list. */
		onsaved?: (result: { markdown: string; ideaDeleted: boolean }) => void;
	}
	let { idea, ensureIdea, onchange, onsaved }: Props = $props();

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
			const id = idea.id ?? (await ensureIdea());
			const r = await saveIdeaNotes({ id, markdown: sent });
			if (editor.markdownCurrent === sent) editor.markAsSaved();
			version++;
			onchange?.(sent);
			onsaved?.({ markdown: sent, ideaDeleted: r.ideaDeleted });
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
		<MarkdownDocEditor
			bind:editor
			markdown={idea.notes}
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

	<!-- control bar -->
	<div class="absolute top-2 right-12 flex items-center gap-2">
		{#if pending}
			<span class="i-ph-circle-notch animate-spin opacity-80" aria-hidden="true"></span>
		{/if}
	</div>
</div>
