<script lang="ts">
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { saveDoc } from "$lib/remote/songs.remote";
	import type { SongDocKind } from "$lib/val/SongDocKindSchema";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";
	import { invalidateAll } from "$app/navigation";
	import type { Snippet } from "svelte";
	import { untrack } from "svelte";

	/**
	 * One song document (chart, lyrics or notes) in the documents panel:
	 * the rendered HTML to read, and, when `editing`, the same editor the
	 * full-page route uses, saving through the same remote form, without
	 * leaving the song, in its "embedded" mode (autosave, no header or
	 * shading: the tab names the document, the panel frames it, its ⋯ menu
	 * picks the `view`, and the check button or Escape close through close()).
	 * Render one at a time — the remote form attaches to a single <form>.
	 */
	interface Props {
		songId: string;
		kind: SongDocKind;
		label: string;
		hint: string;
		/** The document's markdown (for the editor). */
		markdown: string;
		/** Its rendered, sanitised HTML (for reading). */
		html: string;
		version: number;
		canEdit: boolean;
		editing?: boolean;
		/** Unsaved edits in the editor; the page asks before switching documents. */
		dirty?: boolean;
		/** Rendered above the document, e.g. an AI draft. */
		above?: Snippet;
		/** The editor pane to show while editing; the page's panel menu sets it. */
		view?: "rendered" | "markdown";
		/** A save is in flight (the page shows it on its check button). */
		saving?: boolean;
		/** Monospace in every view (chord grids line up); the page's panel menu toggles it. */
		mono?: boolean;
	}

	let {
		songId,
		kind,
		label,
		hint,
		markdown,
		html,
		version,
		canEdit,
		editing = $bindable(false),
		dirty = $bindable(false),
		above,
		view = "rendered",
		saving = $bindable(false),
		mono = false,
	}: Props = $props();

	const fields = saveDoc.fields;
	let editor = $state<MarkdownEditorState | null>(null);
	let savedVersion = $state(untrack(() => version));
	let confirmEmpty = $state(false);
	let saveError = $state<string | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);
	$effect(() => {
		dirty = !!editor?.hasEdits;
	});
	$effect(() => {
		saving = !!saveDoc.pending;
	});
	$effect(() => {
		savedVersion = version;
	});

	// close() waits for the save it starts; the resolver is kept until that
	// save reports back.
	let closeResolve: (() => void) | null = null;
	/**
	 * Save what is unsaved, then leave edit mode. Resolves once the save has
	 * reported (at once when there is nothing to save); a refused save (an
	 * emptied document) keeps the editor open with the message.
	 */
	export async function close(): Promise<void> {
		// The WYSIWYG writes its markdown on a 250 ms debounce: let the last keystrokes land.
		await new Promise((r) => setTimeout(r, 300));
		if (!editor?.hasEdits || !formEl) {
			editing = false;
			return;
		}
		await new Promise<void>((resolve) => {
			closeResolve = resolve;
			formEl?.requestSubmit();
		});
	}
	function settleClose(saved: boolean) {
		if (!closeResolve) return;
		if (saved) editing = false;
		closeResolve();
		closeResolve = null;
	}

	const enhanced = saveDoc.enhance(async ({ submit }) => {
		saveError = null;
		const sent = editor?.markdownCurrent;
		await submit();
		const issues = fields.allIssues();
		const result = saveDoc.result;
		if (issues?.length) {
			saveError = issues.map((i) => i.message).join(" ");
			settleClose(false);
			return;
		}
		if (result && "needsConfirm" in result) {
			saveError = result.error ?? "Save refused; save again to confirm.";
			confirmEmpty = true;
			settleClose(false);
			return;
		}
		if (result && "version" in result) {
			// Edits typed while the save was in flight stay unsaved (autosave sends them next).
			if (editor && editor.markdownCurrent === sent) editor.markAsSaved();
			savedVersion = result.version;
			confirmEmpty = false;
			// The page re-renders the document's HTML from what was saved.
			await invalidateAll();
			settleClose(true);
		}
	});
</script>

{#if editing && canEdit}
	<!-- The box scrolls inside; the edit-mode badge is anchored to its corner, clear of the text. -->
	<div class="relative h-full min-h-full">
		<form
			bind:this={formEl}
			class="h-full min-h-full max-h-[70vh] overflow-y-auto bg-blue-300/5 border rounded-md border-current/40 px-6 pt-12 pb-16"
			{...enhanced}
		>
			<input {...fields.songId.as("hidden", songId)} />
			<input {...fields.kind.as("hidden", kind)} />
			<input {...fields.markdown.as("hidden", editor?.markdownCurrent ?? markdown)} />
			<input {...fields.confirmEmpty.as("hidden", confirmEmpty ? "true" : "false")} />
			<MarkdownDocEditor
				bind:editor
				{markdown}
				docKey="{songId}/{kind}"
				{label}
				{hint}
				backHref=""
				backLabel=""
				version={savedVersion}
				pending={!!saveDoc.pending}
				{confirmEmpty}
				{saveError}
				mode="embedded"
				{view}
				{mono}
				onsave={() => formEl?.requestSubmit()}
				onclose={() => void close()}
			/>
		</form>
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
		class="h-full min-h-full max-h-[70vh] overflow-y-auto bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8 {mono
			? 'font-mono'
			: ''}"
	>
		{@render above?.()}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
		{@html html}
	</article>
{:else}
	<div
		class="h-full min-h-full max-h-[70vh] overflow-y-auto bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8 {mono
			? 'font-mono'
			: ''}"
	>
		{@render above?.()}
		<p>
			No {kind} yet.{#if canEdit}
				<button class="ml-1 link-dim" type="button" onclick={() => (editing = true)}
					>Write it.</button
				>
			{/if}
		</p>
	</div>
{/if}
