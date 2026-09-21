<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { saveUserDoc } from "$lib/remote/userDocs.remote";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";
	import { untrack } from "svelte";

	let { data } = $props();

	// The same save flow as a documentation page (src/routes/docs/[slug]/edit).
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
	<title>{pageTitle(`Edit · ${data.post.title} · Blog`)}</title>
</svelte:head>

<form bind:this={formEl} class="page" {...enhanced}>
	<input {...fields.id.as("hidden", data.post.id)} />
	<input {...fields.markdown.as("hidden", editor?.markdownCurrent ?? data.markdown)} />
	<input {...fields.confirmEmpty.as("hidden", confirmEmpty ? "true" : "false")} />
	<MarkdownDocEditor
		bind:editor
		markdown={data.markdown}
		docKey={data.post.id}
		label={data.post.title}
		hint={data.post.published
			? "This post is live: a save shows at once. Select text for formatting, and the ⋮ next to a block changes its type."
			: "A draft: only admins see it until you publish it from the post's settings. Select text for formatting, and the ⋮ next to a block changes its type."}
		backHref="/blog/{data.post.slug}"
		backLabel={data.post.title}
		{version}
		pending={!!saveUserDoc.pending}
		{confirmEmpty}
		{saveError}
		onsave={() => formEl?.requestSubmit()}
	/>
</form>
