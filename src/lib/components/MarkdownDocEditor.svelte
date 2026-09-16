<script lang="ts">
	import type { MarkdownEditor, MarkdownEditorState } from "@kevinpeckham/woof-editor";
	import { onMount, untrack } from "svelte";

	/**
	 * The document editor shared by song documents and user docs: woof's
	 * WYSIWYG and a markdown textarea over one string, undo/redo, discard,
	 * ⌘S. It renders the header row and the panes; the page around it owns
	 * the <form> (this component's Save is a submit button), the hidden
	 * inputs, and what happens after a save (`markAsSaved()` on `editor`).
	 */
	interface Props {
		markdown: string;
		/** Identity of the document; the editor re-seeds only when it changes. */
		docKey: string;
		label: string;
		hint: string;
		backHref: string;
		backLabel: string;
		version: number;
		pending: boolean;
		confirmEmpty: boolean;
		saveError: string | null;
		/** Asked to submit the surrounding form (⌘S). */
		onsave: () => void;
		editor?: MarkdownEditorState | null;
		/** Inside a panel: no back link or page title, a Done button instead. */
		compact?: boolean;
		onclose?: () => void;
		/**
		 * Save on idle (and ⌘S) instead of through a Save button, and show no
		 * version. The button still appears for one case autosave skips: an
		 * emptied document, which the server asks to confirm.
		 */
		autosave?: boolean;
		/** Show the label in the header (false where a panel's tab already names the document). */
		showTitle?: boolean;
		/** Offer the hint as an ⓘ tooltip in the header instead of a line above the pane. */
		hintAsTooltip?: boolean;
		/** No shading or border around the panes (for a panel that has its own). */
		bare?: boolean;
	}

	let {
		markdown,
		docKey,
		label,
		hint,
		backHref,
		backLabel,
		version,
		pending,
		confirmEmpty,
		saveError,
		onsave,
		editor = $bindable(null),
		compact = false,
		onclose,
		autosave = false,
		showTitle = true,
		hintAsTooltip = false,
		bare = false,
	}: Props = $props();

	// The editor package is imported in the browser only (type imports above
	// are erased). Its server build pulls in isomorphic-dompurify → jsdom,
	// which Vercel's function runtime cannot load; and the surface is
	// contenteditable, so there is nothing useful to render on the server.
	let Editor = $state<typeof MarkdownEditor | null>(null);
	let loadedKey = untrack(() => docKey);

	onMount(async () => {
		const mod = await import("@kevinpeckham/woof-editor");
		editor = new mod.MarkdownEditorState({ markdown });
		Editor = mod.MarkdownEditor;
	});

	// Post-save `update()` re-runs load with the same document, so re-seeding
	// on every `data` change would stomp live editor state (replicator learned
	// this the hard way). markAsSaved() is the post-save sync.
	$effect(() => {
		const key = docKey;
		const md = markdown;
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

	// Autosave: a save is asked for AUTOSAVE_MS after the last change, unless
	// one is in flight (then shortly after) or the document has been emptied
	// (that needs the explicit, confirmed Save). The page marks the editor
	// saved only when nothing changed meanwhile, so later edits are not lost.
	const AUTOSAVE_MS = 1500;
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let empty = $derived(!editor?.markdownCurrent.trim());
	$effect(() => {
		if (!autosave || !editor) return;
		void editor.markdownCurrent;
		untrack(() => scheduleSave(AUTOSAVE_MS));
		return () => {
			if (saveTimer) clearTimeout(saveTimer);
			saveTimer = null;
		};
	});
	function scheduleSave(ms: number) {
		if (saveTimer) clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = null;
			if (!editor?.hasEdits || !editor.markdownCurrent.trim()) return;
			if (pending) return scheduleSave(500);
			onsave();
		}, ms);
	}

	function discard() {
		if (!editor) return;
		if (editor.hasEdits && !confirm("Discard unsaved changes?")) return;
		editor.reset(markdown);
	}

	function onkeydown(e: KeyboardEvent) {
		const mod = e.metaKey || e.ctrlKey;
		if (!mod) return;
		const key = e.key.toLowerCase();
		if (key === "s") {
			e.preventDefault();
			if (editor?.hasEdits && !pending) onsave();
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

<header class="flex flex-wrap items-center gap-3 border-t border-t-current/40 pt-2">
	{#if compact}
		<span class="grow text-sm font-600">
			{#if showTitle}{label}{:else}<span class="sr-only">{label}</span>{/if}
		</span>
	{:else}
		<a class="text-sm link-dim" href={backHref}>← {backLabel}</a>
		<h3 class="grow display">{label}</h3>
	{/if}

	<!-- rendered / markdown toggle -->
	<div
		class="flex overflow-hidden rounded border border-white/15 text-xs"
		role="tablist"
		aria-label="{label} view"
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
	{#if hintAsTooltip}
		<span class="i-ph-info text-dim cursor-help" role="img" title={hint} aria-label={hint}></span>
	{/if}
	<!-- undo/redo buttons -->
	<button
		class="text-xs text-dim disabled:opacity-30 hidden"
		type="button"
		onclick={() => editor?.undo()}
		disabled={!editor?.canUndo}
		title="Undo (⌘Z / Ctrl+Z)"
		><span class="i-ph-arrow-counter-clockwise mr-1" aria-hidden="true"></span>Undo</button
	>
	<button
		class="text-xs text-dim disabled:opacity-30 hidden"
		type="button"
		onclick={() => editor?.redo()}
		disabled={!editor?.canRedo}
		title="Redo (⌘⇧Z / Ctrl+Y)"
		><span class="i-ph-arrow-clockwise mr-1" aria-hidden="true"></span>Redo</button
	>
	{#if editor?.hasEdits && !autosave}
		<button class="text-xs link-dim" type="button" onclick={discard}> Discard </button>
	{/if}
	{#if autosave && pending}
		<span class="text-xs text-dim">Saving…</span>
	{/if}
	{#if !autosave || (editor?.hasEdits && empty)}
		<button
			class="button-accent button-sm lg-button-xs disabled:opacity-40"
			type="submit"
			disabled={!editor?.hasEdits || pending}
			title="Save (⌘S / Ctrl+S)"
		>
			{pending ? "Saving…" : confirmEmpty ? `Save empty ${label.toLowerCase()}` : "Save"}
		</button>
	{/if}
	{#if !autosave}
		<span class="text-xs text-dim tabular-nums" title="Current version">v{version}</span>
	{/if}
	{#if compact && onclose}
		<button
			class="button button-xs"
			type="button"
			onclick={() => {
				if (!autosave && editor?.hasEdits && !confirm("Close without saving your changes?")) return;
				onclose();
			}}
		>
			Done
		</button>
	{/if}
</header>

{#if saveError}
	<p class="mb-4 rounded bg-row px-3 py-2 text-sm text-red-400">{saveError}</p>
{/if}

{#if view === "rendered"}
	{#if !hintAsTooltip}<p class="mb-2 text-xs text-dim">{hint}</p>{/if}
	<div class="chart-editor {bare ? '' : 'surface'} py-4 pr-6 pl-12 {compact ? 'mt-3' : ''}">
		{#if Editor && editor}
			<Editor {editor} class="chart-body" />
		{:else}
			<div class="chart-body min-h-40 text-dim">Loading editor…</div>
		{/if}
	</div>
{:else}
	{#if !hintAsTooltip}
		<p class="mb-2 text-xs text-dim">
			Markdown source. Edits here and in the rendered view are the same document; fenced code blocks
			(```) keep chord spacing.
		</p>
	{/if}
	{#if editor}
		<textarea
			class="chart-source block w-full {bare
				? 'bg-transparent'
				: 'surface'} px-4 py-3 font-mono text-sm leading-relaxed focus:outline-none min-h-full"
			bind:value={editor.markdownCurrent}
			rows={Math.max(16, editor.markdownCurrent.split("\n").length + 2)}
			spellcheck="false"
			placeholder="# Title&#10;&#10;## Section&#10;```&#10;| D | A |&#10;```"></textarea>
	{:else}
		<textarea
			class="chart-source block w-full {bare
				? 'bg-transparent'
				: 'surface'} px-4 py-3 font-mono text-sm leading-relaxed min-h-full"
			rows="16"
			disabled>{markdown}</textarea
		>
	{/if}
{/if}
