<script lang="ts">
	import { pageTitle } from "$lib/utils/pageTitle";
	import MarkdownDocEditor from "$lib/components/MarkdownDocEditor.svelte";
	import { saveDoc } from "$lib/remote/songs.remote";
	import type { MarkdownEditorState } from "@kevinpeckham/woof-editor";
	import { untrack } from "svelte";

	let { data } = $props();

	const LABELS = { chart: "Chart", lyrics: "Lyrics", notes: "Notes" } as const;
	const HINTS = {
		chart:
			"Chords and arrangement. Select text for formatting; the ⋮ next to a block changes its type. Use a code block for chord grids so spacing is kept.",
		lyrics:
			"Lyrics. One line per lyric line; a blank line starts a new section, and a heading names it (Verse, Chorus).",
		notes: "Notes. Anything about the song — ideas, references, production to-dos, who plays what.",
	} as const;
	let label = $derived(LABELS[data.kind]);

	// Save through the saveDoc remote form. Hidden inputs carry the document;
	// the enhance callback keeps the editor's caret and history (no re-seed)
	// and only marks the state saved when the server accepted it.
	const fields = saveDoc.fields;
	let editor = $state<MarkdownEditorState | null>(null);
	let version = $state(untrack(() => data.version));
	let confirmEmpty = $state(false);
	let saveError = $state<string | null>(null);
	let formEl = $state<HTMLFormElement | null>(null);

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
			confirmEmpty = true; // the next Save goes through
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
	<title>{pageTitle(`${label} · ${data.song.title}`)}</title>
</svelte:head>

<form bind:this={formEl} class="page" {...enhanced}>
	<input {...fields.songId.as("hidden", data.song.id)} />
	<input {...fields.kind.as("hidden", data.kind)} />
	<input {...fields.markdown.as("hidden", editor?.markdownCurrent ?? data.markdown)} />
	<input {...fields.confirmEmpty.as("hidden", confirmEmpty ? "true" : "false")} />
	<MarkdownDocEditor
		bind:editor
		markdown={data.markdown}
		docKey="{data.song.id}/{data.kind}"
		{label}
		hint={HINTS[data.kind]}
		mono={data.kind === "chart"}
		backHref="/{data.account.slug}/projects/{data.song.project.slug}/{data.song.slug}"
		backLabel={data.song.title}
		{version}
		pending={!!saveDoc.pending}
		{confirmEmpty}
		{saveError}
		onsave={() => formEl?.requestSubmit()}
	/>
</form>
