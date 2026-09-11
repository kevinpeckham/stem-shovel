<script lang="ts">
	import { enhance } from "$app/forms";
	import type { MarkdownEditor, MarkdownEditorState } from "@kevinpeckham/woof-editor";
	import { onMount, untrack } from "svelte";

	let { data, form } = $props();

	// The editor package is imported in the browser only (type imports above
	// are erased). Its server build pulls in isomorphic-dompurify → jsdom,
	// which Vercel's function runtime cannot load; and the surface is
	// contenteditable, so there is nothing useful to render on the server.
	let Editor = $state<typeof MarkdownEditor | null>(null);
	let editor = $state<MarkdownEditorState | null>(null);
	let loadedSongId = untrack(() => data.song.id);

	onMount(async () => {
		const mod = await import("@kevinpeckham/woof-editor");
		editor = new mod.MarkdownEditorState({ markdown: data.song.chartMarkdown });
		Editor = mod.MarkdownEditor;
	});

	// Post-save `update()` re-runs load with the same song, so re-seeding on
	// every `data` change would stomp live editor state (replicator learned
	// this the hard way). Re-seed only when the song identity changes;
	// markAsSaved() is the post-save sync.
	$effect(() => {
		const id = data.song.id;
		const md = data.song.chartMarkdown;
		untrack(() => {
			if (id === loadedSongId) return;
			loadedSongId = id;
			editor?.reset(md);
		});
	});

	/**
	 * Which pane is showing. "rendered" is the WYSIWYG; "markdown" is a plain
	 * textarea bound to the same `editor.markdownCurrent`, so switching never
	 * loses anything: the WYSIWYG re-seeds itself from that string on remount.
	 */
	let view = $state<"rendered" | "markdown">("rendered");

	// The WYSIWYG pushes undo snapshots itself; textarea edits arrive here as
	// plain writes to markdownCurrent, so debounce them into the same history
	// (skipping writes that came from the WYSIWYG or from undo/redo).
	let historyTimer: ReturnType<typeof setTimeout> | null = null;
	$effect(() => {
		if (!editor) return;
		const md = editor.markdownCurrent;
		untrack(() => {
			if (!editor || editor.isSyncingFromWysiwyg || editor.isReplayingHistory) return;
			if (view !== "markdown") return;
			if (historyTimer) clearTimeout(historyTimer);
			historyTimer = setTimeout(() => {
				historyTimer = null;
				editor?.pushHistory(md);
			}, 500);
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
				editor?.markAsSaved();
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
		if (!editor) return;
		if (editor.hasEdits && !confirm("Discard unsaved changes?")) return;
		editor.reset(data.song.chartMarkdown);
	}

	let formEl = $state<HTMLFormElement | null>(null);
	function onkeydown(e: KeyboardEvent) {
		const mod = e.metaKey || e.ctrlKey;
		if (!mod) return;
		const key = e.key.toLowerCase();
		if (key === "s") {
			e.preventDefault();
			if (editor?.hasEdits && !saving) formEl?.requestSubmit();
			return;
		}
		// Inside the WYSIWYG its own handler owns undo/redo. Elsewhere (the
		// markdown textarea) use the shared history instead of the browser's.
		if (e.target instanceof HTMLElement && e.target.closest(".woof-editor-body")) return;
		const isRedo = (key === "z" && e.shiftKey) || (key === "y" && !e.metaKey && !e.shiftKey);
		const isUndo = key === "z" && !e.shiftKey;
		if (isRedo && editor?.canRedo) {
			e.preventDefault();
			editor.redo();
		} else if (isUndo && editor?.canUndo) {
			e.preventDefault();
			editor.undo();
		}
	}
	function onbeforeunload(e: BeforeUnloadEvent) {
		if (editor?.hasEdits) e.preventDefault();
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
	<input type="hidden" name="markdown" value={editor?.markdownCurrent ?? data.song.chartMarkdown} />
	<input type="hidden" name="confirmEmpty" value={confirmEmpty ? "true" : "false"} />

	<header class="mb-6 flex flex-wrap items-center gap-3">
		<a
			class="text-sm text-dim underline underline-offset-4"
			href="/projects/{data.song.project.slug}/{data.song.slug}">← {data.song.title}</a
		>
		<h1 class="grow text-xl font-semibold">Chart</h1>
		<div
			class="flex overflow-hidden rounded border border-line text-xs"
			role="tablist"
			aria-label="Chart view"
		>
			<button
				type="button"
				role="tab"
				aria-selected={view === "rendered"}
				class="px-3 py-1 {view === 'rendered' ? 'bg-ink text-panel' : 'text-dim'}"
				onclick={() => (view = "rendered")}>Rendered</button
			>
			<button
				type="button"
				role="tab"
				aria-selected={view === "markdown"}
				class="px-3 py-1 {view === 'markdown' ? 'bg-ink text-panel' : 'text-dim'}"
				onclick={() => (view = "markdown")}>Markdown</button
			>
		</div>
		<button
			class="text-xs text-dim disabled:opacity-30"
			type="button"
			onclick={() => editor?.undo()}
			disabled={!editor?.canUndo}
			title="Undo (⌘Z / Ctrl+Z)">↶ Undo</button
		>
		<button
			class="text-xs text-dim disabled:opacity-30"
			type="button"
			onclick={() => editor?.redo()}
			disabled={!editor?.canRedo}
			title="Redo (⌘⇧Z / Ctrl+Y)">↷ Redo</button
		>
		{#if editor?.hasEdits}
			<button class="text-xs text-dim underline underline-offset-4" type="button" onclick={discard}>
				Discard
			</button>
		{/if}
		<button
			class="rounded bg-ink px-3 py-1.5 text-sm text-panel disabled:opacity-40"
			type="submit"
			disabled={!editor?.hasEdits || saving}
			title="Save (⌘S / Ctrl+S)"
		>
			{saving ? "Saving…" : confirmEmpty ? "Save empty chart" : "Save"}
		</button>
		<span class="text-xs text-dim tabular-nums" title="Current version">v{version}</span>
	</header>

	{#if errorDisplay}
		<p class="mb-4 rounded bg-row px-3 py-2 text-sm text-solo">{errorDisplay}</p>
	{/if}

	{#if view === "rendered"}
		<p class="mb-2 text-xs text-dim">
			Chords, lyrics, arrangement. Select text for formatting; the ⋮ next to a block changes its
			type. Use a code block for chord grids so spacing is kept.
		</p>
		<div class="chart-editor rounded-lg bg-row py-4 pr-6 pl-12">
			{#if Editor && editor}
				<Editor {editor} class="chart-body" />
			{:else}
				<div class="chart-body min-h-40 text-dim">Loading editor…</div>
			{/if}
		</div>
	{:else}
		<p class="mb-2 text-xs text-dim">
			Markdown source. Edits here and in the rendered view are the same document; fenced code blocks
			(```) keep chord spacing.
		</p>
		{#if editor}
			<textarea
				class="chart-source block w-full rounded-lg bg-row px-4 py-3 font-mono text-sm leading-relaxed focus:outline-none"
				bind:value={editor.markdownCurrent}
				rows={Math.max(16, editor.markdownCurrent.split("\n").length + 2)}
				spellcheck="false"
				placeholder="# Song title&#10;&#10;## Verse&#10;```&#10;| D | A |&#10;```"></textarea>
		{:else}
			<textarea
				class="chart-source block w-full rounded-lg bg-row px-4 py-3 font-mono text-sm leading-relaxed"
				rows="16"
				disabled>{data.song.chartMarkdown}</textarea
			>
		{/if}
	{/if}
</form>
