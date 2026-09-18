<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { saveUserDoc } from "$lib/remote/userDocs.remote";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";
	import { untrack } from "svelte";

	let { data } = $props();

	// The same save flow as a song document (see that page): hidden inputs
	// carry the document, the editor keeps its caret and history across a save.
	const fields = saveUserDoc.fields;
	let editor = $state<MarkdownEditorState | null>(null);
	let version = $state(untrack(() => data.version));
	let confirmEmpty = $state(false);
	let saveError = $state<string | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);

	const enhanced = saveUserDoc.enhance(async ({ submit }) => {
		saveError = null;
		await submit();
		const issues = fields.allIssues();
		const result = saveUserDoc.result;
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
			version = result.version;
			confirmEmpty = false;
		}
	});
</script>

<svelte:head>
	<title>{pageTitle(`Edit · ${data.doc.title} · Docs`)}</title>
</svelte:head>

<form bind:this={formEl} class="page" {...enhanced}>
	<input {...fields.id.as("hidden", data.doc.id)} />
	<input {...fields.markdown.as("hidden", editor?.markdownCurrent ?? data.markdown)} />
	<input {...fields.confirmEmpty.as("hidden", confirmEmpty ? "true" : "false")} />
	<MarkdownDocEditor
		bind:editor
		markdown={data.markdown}
		docKey={data.doc.id}
		label={data.doc.title}
		hint="Write for someone using Stem Shovel for the first time. Headings split the page into sections; select text for formatting, and the ⋮ next to a block changes its type."
		backHref="/docs/{data.doc.slug}"
		backLabel={data.doc.title}
		{version}
		pending={!!saveUserDoc.pending}
		{confirmEmpty}
		{saveError}
		onsave={() => formEl?.requestSubmit()}
	/>
</form>
