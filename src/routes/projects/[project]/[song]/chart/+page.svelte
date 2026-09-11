<script lang="ts">
	import { browser } from "$app/environment";
	import { enhance } from "$app/forms";
	import { MarkdownEditor, MarkdownEditorState } from "@kevinpeckham/woof-editor";
	import { untrack } from "svelte";

	let { data, form } = $props();

	// Constructed once. Post-save `update()` re-runs load with the same song,
	// so re-seeding on every `data` change would stomp live editor state
	// (replicator learned this the hard way). Re-seed only when the song
	// identity changes; markAsSaved() is the post-save sync.
	const editor = new MarkdownEditorState({ markdown: untrack(() => data.song.chartMarkdown) });
	let loadedSongId = untrack(() => data.song.id);
	$effect(() => {
		const id = data.song.id;
		const md = data.song.chartMarkdown;
		untrack(() => {
			if (id === loadedSongId) return;
			loadedSongId = id;
			editor.reset(md);
		});
	});

	let saving = $state(false);
	let version = $state(untrack(() => data.song.chartVersion));
	let confirmEmpty = $state(false);
	let saveError = $state<string | null>(null);
	let errorDisplay = $derived(saveError ?? (form?.error ? String(form.error) : null));

	function handleSave() {
		saveError = null;
		saving = true;
		return async ({
			result,
			update,
		}: {
			result: { type: string; data?: { version?: number; error?: string; needsConfirm?: boolean } };
			update: (opts?: { reset?: boolean }) => Promise<void>;
		}) => {
			saving = false;
			if (result.type === "success") {
				editor.markAsSaved();
				if (typeof result.data?.version === "number") version = result.data.version;
				confirmEmpty = false;
			} else if (result.type === "failure") {
				saveError = result.data?.error ?? "Save failed";
				// Second save of an intentionally empty chart goes through.
				if (result.data?.needsConfirm) confirmEmpty = true;
			}
			await update({ reset: false });
		};
	}

	function discard() {
		if (editor.hasEdits && !confirm("Discard unsaved changes?")) return;
		editor.reset(data.song.chartMarkdown);
	}

	let formEl = $state<HTMLFormElement | null>(null);
	function onkeydown(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
			e.preventDefault();
			if (editor.hasEdits && !saving) formEl?.requestSubmit();
		}
	}
	function onbeforeunload(e: BeforeUnloadEvent) {
		if (editor.hasEdits) e.preventDefault();
	}
</script>

<svelte:window {onkeydown} {onbeforeunload} />

<svelte:head>
	<title>Chart · {data.song.title} — Stem Shovel</title>
</svelte:head>

<form
	bind:this={formEl}
	class="mx-auto max-w-4xl px-4 py-8"
	method="POST"
	action="?/save"
	use:enhance={handleSave}
>
	<input type="hidden" name="markdown" value={editor.markdownCurrent} />
	<input type="hidden" name="confirmEmpty" value={confirmEmpty ? "true" : "false"} />

	<header class="mb-6 flex flex-wrap items-center gap-3">
		<a
			class="text-sm text-dim underline underline-offset-4"
			href="/projects/{data.song.project.slug}/{data.song.slug}">← {data.song.title}</a
		>
		<h1 class="grow text-xl font-semibold">Chart</h1>
		<button
			class="text-xs text-dim disabled:opacity-30"
			type="button"
			onclick={() => editor.undo()}
			disabled={!editor.canUndo}
			title="Undo (⌘Z / Ctrl+Z)">↶ Undo</button
		>
		<button
			class="text-xs text-dim disabled:opacity-30"
			type="button"
			onclick={() => editor.redo()}
			disabled={!editor.canRedo}
			title="Redo (⌘⇧Z / Ctrl+Y)">↷ Redo</button
		>
		{#if editor.hasEdits}
			<button class="text-xs text-dim underline underline-offset-4" type="button" onclick={discard}>
				Discard
			</button>
		{/if}
		<button
			class="rounded bg-ink px-3 py-1.5 text-sm text-panel disabled:opacity-40"
			type="submit"
			disabled={!editor.hasEdits || saving}
			title="Save (⌘S / Ctrl+S)"
		>
			{saving ? "Saving…" : confirmEmpty ? "Save empty chart" : "Save"}
		</button>
		<span class="text-xs text-dim tabular-nums" title="Current version">v{version}</span>
	</header>

	{#if errorDisplay}
		<p class="mb-4 rounded bg-row px-3 py-2 text-sm text-solo">{errorDisplay}</p>
	{/if}

	<p class="mb-2 text-xs text-dim">
		Chords, lyrics, arrangement. Select text for formatting; the ⋮ next to a block changes its type.
		Use a code block for chord grids so spacing is kept.
	</p>

	<div class="chart-editor rounded-lg bg-row py-4 pr-6 pl-12">
		{#if browser}
			<MarkdownEditor {editor} class="chart-body" />
		{:else}
			<div class="chart-body min-h-40 text-dim">Loading editor…</div>
		{/if}
	</div>
</form>
