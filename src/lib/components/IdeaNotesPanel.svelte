<script lang="ts">
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { renderNotes, saveRecordingNotes } from "$lib/remote/recordings.remote";
	import { notify } from "$lib/state/notifications.svelte";
	import { errorMessage } from "$lib/utils/errorMessage";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";
	import { onMount } from "svelte";

	/**
	 * The notes panel of the Idea Recorder: the song page's document panel,
	 * for one document. A read view with a pencil to edit, the embedded
	 * editor with autosave while editing, a check (or Escape) to finish, the
	 * ⋯ menu choosing Rich Text or Markdown, and the edit-mode badge. Before
	 * the recording exists the notes are a draft the page hands to the save;
	 * once it has an id they autosave to the server.
	 */
	interface Props {
		recording: { id: string | null; notes: string };
		/** Receives the draft on every autosave while there is no recording yet. */
		ondraft?: (markdown: string) => void;
	}
	let { recording, ondraft }: Props = $props();

	let editing = $state(false);
	let editor = $state<MarkdownEditorState | null>(null);
	let pending = $state(false);
	let saveError = $state<string | null>(null);
	let version = $state(0);
	let view = $state<"rendered" | "markdown">("rendered");
	/** The read view's HTML, rendered on the server like the song documents. */
	let html = $state("");
	let menuEl = $state<HTMLDetailsElement | null>(null);
	const VIEWS = [
		{ id: "rendered", name: "Rich Text" },
		{ id: "markdown", name: "Markdown" },
	] as const;

	/** What the editor holds, or the notes as given before any edit. */
	const current = () => editor?.markdownCurrent ?? recording.notes;

	async function render() {
		const markdown = current();
		html = markdown.trim() ? await renderNotes(markdown) : "";
	}
	onMount(() => {
		if (recording.notes.trim()) void render();
	});

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

	/** Save what is unsaved, render the read view, leave edit mode. */
	async function close() {
		// The WYSIWYG writes its markdown on a 250 ms debounce: let the last keystrokes land.
		await new Promise((r) => setTimeout(r, 300));
		if (editor?.hasEdits) await save();
		await render();
		editing = false;
	}

	function closeMenu(e: Event) {
		if (menuEl?.open && !(e.type === "pointerdown" && menuEl.contains(e.target as Node))) {
			menuEl.open = false;
		}
	}
</script>

<svelte:window
	onpointerdown={closeMenu}
	onkeydown={(e) => {
		if (e.key === "Escape") closeMenu(e);
	}}
/>

<div
	class="grid gap-2 grid-cols-1 place-content-[start_stretch] h-full min-h-560px max-w-full grid-rows-1fr relative"
>
	{#if editing}
		<!-- The box scrolls inside; the edit-mode badge is anchored to its corner, clear of the text. -->
		<div class="relative h-full min-h-full">
			<div
				class="h-full min-h-full max-h-[70vh] overflow-y-auto bg-blue-300/5 border rounded-md border-current/40 px-6 pt-12 pb-16"
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
					{view}
					onsave={() => void save()}
					onclose={() => void close()}
				/>
			</div>
			<div class="pointer-events-none absolute right-6 bottom-4" aria-hidden="true">
				<span
					class="rounded border border-current/40 bg-oxford px-2 py-1 text-11px font-600 tracking-wider uppercase text-dim"
				>
					Edit mode
				</span>
			</div>
		</div>
	{:else if html}
		<article
			class="h-full min-h-full max-h-[70vh] overflow-y-auto bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8"
		>
			<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
			{@html html}
		</article>
	{:else}
		<div
			class="h-full min-h-full max-h-[70vh] overflow-y-auto bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8"
		>
			<p>
				No notes yet.
				<button class="ml-1 link-dim" type="button" onclick={() => (editing = true)}
					>Write them.</button
				>
			</p>
		</div>
	{/if}

	<!-- tool bar, as on the song page: the document's name, edit / done, and the ⋯ menu -->
	<div class="absolute top-2 right-3 mb-2 flex items-stretch gap-4">
		<div class="flex overflow-hidden rounded border border-white/15 items-center">
			<span class="button button-xs bg-blue-300 text-oxford border-blue-300 cursor-default"
				>Notes</span
			>
		</div>
		<div class="flex items-stretch gap-2">
			<button
				class="button button-xs flex items-center {editing
					? 'bg-blue-300 text-oxford border-blue-300'
					: ''}"
				type="button"
				title={editing ? "Done editing the notes" : "Edit the notes here"}
				aria-label={editing ? "Done editing the notes" : "Edit the notes"}
				aria-pressed={editing}
				onclick={async () => {
					if (editing) await close();
					else editing = true;
				}}
			>
				<span
					class={editing
						? pending
							? "i-ph-circle-notch animate-spin"
							: "i-ph-check"
						: html
							? "i-ph-pencil"
							: "i-ph-plus"}
				></span>
			</button>
			<details class="relative flex" bind:this={menuEl}>
				<summary
					class="button button-xs flex items-center list-none [&::-webkit-details-marker]:hidden"
					title="More"
					aria-label="Notes menu"
				>
					<span class="i-ph-dots-three-outline-vertical-fill" aria-hidden="true"></span>
				</summary>
				<div
					class="absolute top-full right-0 z-20 mt-1 min-w-56 rounded border border-white/15 bg-oxford p-1 text-sm shadow-lg"
					role="menu"
				>
					{#if editing}
						{#each VIEWS as v (v.id)}
							<button
								class="flex w-full items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/10"
								type="button"
								role="menuitemradio"
								aria-checked={view === v.id}
								onclick={() => {
									view = v.id;
									if (menuEl) menuEl.open = false;
								}}
							>
								<span class="i-ph-check {view === v.id ? '' : 'invisible'}" aria-hidden="true"
								></span>{v.name}
							</button>
						{/each}
					{:else}
						<div class="px-2 py-1 text-xs text-dim">Nothing to do here yet</div>
					{/if}
				</div>
			</details>
		</div>
	</div>
</div>
