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
	 * leaving the song. Render one at a time — the remote form attaches to a
	 * single <form>.
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
		savedVersion = version;
	});

	const enhanced = saveDoc.enhance(async ({ submit }) => {
		saveError = null;
		await submit();
		const issues = fields.allIssues();
		const result = saveDoc.result;
		if (issues?.length) {
			saveError = issues.map((i) => i.message).join(" ");
			return;
		}
		if (result && "needsConfirm" in result) {
			saveError = result.error ?? "Save refused; save again to confirm.";
			confirmEmpty = true;
			return;
		}
		if (result && "version" in result) {
			editor?.markAsSaved();
			savedVersion = result.version;
			confirmEmpty = false;
			// The page re-renders the document's HTML from what was saved.
			await invalidateAll();
		}
	});
</script>

{#if editing && canEdit}
	<form
		bind:this={formEl}
		class="h-full min-h-full bg-blue-300/5 border rounded-md border-current/40 px-6 pt-12 pb-8"
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
			compact
			onsave={() => formEl?.requestSubmit()}
			onclose={() => (editing = false)}
		/>
	</form>
{:else if html}
	<article
		class="h-full min-h-full bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8"
	>
		{@render above?.()}
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- sanitized server-side in renderMarkdown -->
		{@html html}
	</article>
{:else}
	<div
		class="h-full min-h-full bg-blue-300/5 chart-body border rounded-md border-current/40 px-6 pt-12 pb-8"
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
