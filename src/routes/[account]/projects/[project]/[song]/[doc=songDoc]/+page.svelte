<script lang="ts">
	import { saveDoc } from "$lib/remote/songs.remote";
	import type { MarkdownEditor, MarkdownEditorState } from "@kevinpeckham/woof-editor";
	import { onMount, untrack } from "svelte";

	let { data } = $props();

	const LABELS = { chart: "Chart", lyrics: "Lyrics" } as const;
	let label = $derived(LABELS[data.kind]);

	// The editor package is imported in the browser only (type imports above
	// are erased). Its server build pulls in isomorphic-dompurify → jsdom,
	// which Vercel's function runtime cannot load; and the surface is
	// contenteditable, so there is nothing useful to render on the server.
	let Editor = $state<typeof MarkdownEditor | null>(null);
	let editor = $state<MarkdownEditorState | null>(null);
	// Identity of what the editor holds: song + kind. Re-seed only when it changes.
	let loadedKey = untrack(() => `${data.song.id}/${data.kind}`);

	onMount(async () => {
		const mod = await import("@kevinpeckham/woof-editor");
		editor = new mod.MarkdownEditorState({ markdown: data.markdown });
		Editor = mod.MarkdownEditor;
	});

	// Post-save `update()` re-runs load with the same document, so re-seeding
	// on every `data` change would stomp live editor state (replicator learned
	// this the hard way). markAsSaved() is the post-save sync.
	$effect(() => {
		const key = `${data.song.id}/${data.kind}`;
		const md = data.markdown;
		untrack(() => {
			if (key === loadedKey) return;
			loadedKey = key;
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

	// Save through the saveDoc remote form. Hidden inputs carry the document;
	// the enhance callback keeps the editor's caret and history (no re-seed)
	// and only marks the state saved when the server accepted it.
	const fields = saveDoc.fields;
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

	function discard() {
		if (!editor) return;
		if (editor.hasEdits && !confirm("Discard unsaved changes?")) return;
		editor.reset(data.markdown);
	}

	function onkeydown(e: KeyboardEvent) {
		const mod = e.metaKey || e.ctrlKey;
		if (!mod) return;
		const key = e.key.toLowerCase();
		if (key === "s") {
			e.preventDefault();
			if (editor?.hasEdits && !saveDoc.pending) formEl?.requestSubmit();
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
	<title>{label} · {data.song.title} — Stem Shovel</title>
</svelte:head>

<form bind:this={formEl} class="page" {...enhanced}>
	<input {...fields.songId.as("hidden", data.song.id)} />
	<input {...fields.kind.as("hidden", data.kind)} />
	<input {...fields.markdown.as("hidden", editor?.markdownCurrent ?? data.markdown)} />
	<input {...fields.confirmEmpty.as("hidden", confirmEmpty ? "true" : "false")} />

	<header class="flex flex-wrap items-center gap-3">
		<a
			class="text-sm link-dim"
			href="/{data.account.slug}/projects/{data.song.project.slug}/{data.song.slug}"
			>← {data.song.title}</a
		>
		<h1 class="grow display">{label}</h1>
		<div
			class="flex overflow-hidden rounded border border-white/15 text-xs"
			role="tablist"
			aria-label="Chart view"
		>
			<button
				type="button"
				role="tab"
				aria-selected={view === "rendered"}
				class={view === "rendered" ? "tab-active" : "tab-idle"}
				onclick={() => (view = "rendered")}>Rendered</button
			>
			<button
				type="button"
				role="tab"
				aria-selected={view === "markdown"}
				class={view === "markdown" ? "tab-active" : "tab-idle"}
				onclick={() => (view = "markdown")}>Markdown</button
			>
		</div>
		<button
			class="text-xs text-dim disabled:opacity-30"
			type="button"
			onclick={() => editor?.undo()}
			disabled={!editor?.canUndo}
			title="Undo (⌘Z / Ctrl+Z)"
			><span class="i-ph-arrow-counter-clockwise mr-1" aria-hidden="true"></span>Undo</button
		>
		<button
			class="text-xs text-dim disabled:opacity-30"
			type="button"
			onclick={() => editor?.redo()}
			disabled={!editor?.canRedo}
			title="Redo (⌘⇧Z / Ctrl+Y)"
			><span class="i-ph-arrow-clockwise mr-1" aria-hidden="true"></span>Redo</button
		>
		{#if editor?.hasEdits}
			<button class="text-xs link-dim" type="button" onclick={discard}> Discard </button>
		{/if}
		<button
			class="button-accent text-sm disabled:opacity-40"
			type="submit"
			disabled={!editor?.hasEdits || !!saveDoc.pending}
			title="Save (⌘S / Ctrl+S)"
		>
			{saveDoc.pending ? "Saving…" : confirmEmpty ? `Save empty ${label.toLowerCase()}` : "Save"}
		</button>
		<span class="text-xs text-dim tabular-nums" title="Current version">v{version}</span>
	</header>

	{#if saveError}
		<p class="mb-4 rounded bg-row px-3 py-2 text-sm text-red-400">{saveError}</p>
	{/if}

	{#if view === "rendered"}
		<p class="mb-2 text-xs text-dim">
			{data.kind === "chart"
				? "Chords and arrangement. Select text for formatting; the ⋮ next to a block changes its type. Use a code block for chord grids so spacing is kept."
				: "Lyrics. One line per lyric line; a blank line starts a new section, and a heading names it (Verse, Chorus)."}
		</p>
		<div class="chart-editor surface py-4 pr-6 pl-12">
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
				class="chart-source block w-full surface px-4 py-3 font-mono text-sm leading-relaxed focus:outline-none"
				bind:value={editor.markdownCurrent}
				rows={Math.max(16, editor.markdownCurrent.split("\n").length + 2)}
				spellcheck="false"
				placeholder="# Song title&#10;&#10;## Verse&#10;```&#10;| D | A |&#10;```"></textarea>
		{:else}
			<textarea
				class="chart-source block w-full surface px-4 py-3 font-mono text-sm leading-relaxed"
				rows="16"
				disabled>{data.markdown}</textarea
			>
		{/if}
	{/if}
</form>
