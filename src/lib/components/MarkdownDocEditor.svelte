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
		classes?: string;
		version: number;
		pending: boolean;
		confirmEmpty: boolean;
		saveError: string | null;
		/** Asked to submit the surrounding form (⌘S). */
		onsave: () => void;
		editor?: MarkdownEditorState | null;
		/**
		 * "standalone" (default) is the full-page editor: back link, title,
		 * hint line, Save button, version, shaded panes. "embedded" sits in a
		 * panel that already names, frames and controls the document: no
		 * header at all (the panel's own menu sets `view`), no shading, the
		 * text keeping the reading view's margin, and autosave (a save on idle
		 * and ⌘S; the Save button appears only to confirm an emptied document,
		 * which autosave skips). Escape calls `onclose`.
		 */
		mode?: "standalone" | "embedded";
		/** Which pane shows: the WYSIWYG or the markdown source. Standalone's tabs set it; embedded takes it from the panel. */
		view?: "rendered" | "markdown";
		/** Leave edit mode (embedded: Escape). */
		onclose?: () => void;
		/** Monospace throughout (charts: chord grids line up); the source pane is monospace anyway. */
		mono?: boolean;
	}

	let {
		markdown,
		docKey,
		label,
		hint,
		backHref,
		backLabel,
		classes = "",
		version,
		pending,
		confirmEmpty,
		saveError,
		onsave,
		editor = $bindable(null),
		mode = "standalone",
		view = $bindable("rendered"),
		onclose,
		mono = false,
	}: Props = $props();
	let embedded = $derived(mode === "embedded");

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

	const VIEWS = [
		{ id: "markdown", name: "Markdown" },
		{ id: "rendered", name: "Rich Text" },
	] as const;

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

	// Autosave (embedded only): a save is asked for AUTOSAVE_MS after the last
	// change, unless one is in flight (then shortly after). An emptied board
	// saves too: the page treats it as clearing the notes. The page marks the
	// editor saved only when nothing changed meanwhile, so later edits are not lost.
	const AUTOSAVE_MS = 1500;
	let saveTimer: ReturnType<typeof setTimeout> | null = null;
	let empty = $derived(!editor?.markdownCurrent.trim());
	$effect(() => {
		if (!embedded || !editor) return;
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
			if (!editor?.hasEdits) return;
			if (pending) return scheduleSave(500);
			onsave();
		}, ms);
	}

	function discard() {
		if (!editor) return;
		if (editor.hasEdits && !confirm("Discard unsaved changes?")) return;
		editor.reset(markdown);
	}

	// The editor's own menus and popovers take Escape first (they close on
	// it); with none showing, Escape leaves edit mode. They stay in the DOM
	// while closed (manual popovers, a hidden link panel), so only a visible
	// one counts.
	const WOOF_OVERLAYS = ".woof-menu-backdrop, .woof-link-panel, .woof-fn-panel";
	function overlayShowing() {
		return Array.from(document.querySelectorAll(WOOF_OVERLAYS)).some(
			(el) => el.getClientRects().length > 0,
		);
	}
	function onkeydown(e: KeyboardEvent) {
		if (e.key === "Escape" && onclose) {
			if (overlayShowing()) return;
			if (!embedded && editor?.hasEdits && !confirm("Close without saving your changes?")) return;
			onclose();
			return;
		}
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

{#snippet saveButton()}
	<button
		class="button button-accent disabled:opacity-40"
		type="submit"
		disabled={!editor?.hasEdits || pending}
		title="Save (⌘S / Ctrl+S)"
	>
		{pending ? "Saving…" : confirmEmpty ? `Save empty ${label.toLowerCase()}` : "Save"}
	</button>
{/snippet}

<!-- embedded mode = no header: the panel names and controls the document.  -->

<!-- not embedded -->
{#if !embedded}
	{#if backHref}
		<a
			class="flex items-center gap-1 text-0.85em mb-4 hover-underline underline-offset-2 opacity-80 hover-text-accent hover-opacity-100"
			href={backHref}><span class="i-ph-arrow-left-fill underline-none">←</span>{backLabel}</a
		>
	{/if}
	<header
		class="grid grid-cols-1 sm-flex sm-justify-between items-center gap-3 sm-mb-5 xl-max-w-960px"
	>
		<div class="mb-4 sm-mb-0">
			<div class="flex gap-2 items-baseline">
				<h3 class="app-page-heading">{label}</h3>
				<span class="text-xs text-dim tabular-nums" title="Current version">v{version}</span>
			</div>
		</div>

		<!-- toolbar -->
		<div class="flex flex-wrap justify-between gap-3 items-center mb-6 sm-mb-0">
			<!-- rich text / markdown toggle -->
			<div
				class="flex overflow-hidden rounded border border-white/15 max-w-fit text-1em"
				role="tablist"
				aria-label="{label} view"
			>
				{#each VIEWS as v (v.id)}
					<button
						type="button"
						role="tab"
						aria-selected={view === v.id}
						class="px-3 py-1.5 text-0.9em text-nowrap {view === v.id
							? 'bg-blue-100/90 font-500 text-dark'
							: 'tab-idle'}"
						onclick={() => (view = v.id)}>{v.name}</button
					>
				{/each}
			</div>

			<!-- undo/redo (hidden) buttons -->
			<div class="hidden">
				<button
					class="text-xs text-dim disabled:opacity-30"
					type="button"
					onclick={() => editor?.undo()}
					disabled={!editor?.canUndo}
					title="Undo (⌘Z / Ctrl+Z)"
					><span class="i-ph-arrow-counter-clockwise mr-1" aria-hidden="true"></span>Undo</button
				>
				<button
					class=""
					type="button"
					onclick={() => editor?.redo()}
					disabled={!editor?.canRedo}
					title="Redo (⌘⇧Z / Ctrl+Y)"
					><span class="i-ph-arrow-clockwise mr-1" aria-hidden="true"></span>Redo</button
				>
			</div>

			<!-- discard & save pairing -->
			<div class="flex gap-3 items-center">
				<!-- discard button -->
				<button
					class="button disabled-opacity-10"
					disabled={!editor?.hasEdits}
					type="button"
					onclick={discard}
				>
					Discard
				</button>

				<!-- save button -->
				<button
					class="button button-accent disabled-text-current disabled-opacity-10"
					type="submit"
					disabled={!editor?.hasEdits || pending}
					title="Save (⌘S / Ctrl+S)"
				>
					{pending ? "Saving…" : confirmEmpty ? `Save empty ${label.toLowerCase()}` : "Save"}
				</button>
			</div>
		</div>
	</header>
{/if}

{#if saveError}
	<p class="mb-4 rounded bg-row px-3 py-2 text-sm text-red-400">{saveError}</p>
{/if}

<!-- rendered view-->
{#if view === "rendered"}
	{#if !embedded && hint.trim()}<p class="mb-5 opacity-90">{hint}</p>{/if}
	<!--
		Embedded: the text keeps the reading view's margin. The block buttons
		(woof's gutter, normally 38px left of the text) tuck into the panel's
		24px padding and show while the editor is hovered or focused.
	-->
	<div
		class="
			chart-editor
			{mono ? 'font-mono' : ''}
			{embedded
			? '-ml-6 pt-0 pb-4 pr-0 pl-6 [&_.woof-gutter-btn]:(![left:-24px] !min-w-5 !px-0 !opacity-0) [&:hover_.woof-gutter-btn]:!opacity-60 [&:focus-within_.woof-gutter-btn]:!opacity-60'
			: `
				bg-blue-100/5
				block
				leading-relaxed
				min-h-full
				pb-6
				pt-5
				px-5
				resize-none
				rounded-md
				focus-outline-none
				w-full
				xl-max-w-960px`}"
	>
		{#if Editor && editor}
			<Editor {editor} class="chart-body" />
		{:else}
			<div class="chart-body min-h-40 text-dim">Loading editor…</div>
		{/if}
	</div>
{/if}

<!-- markdown -->
{#if view === "markdown"}
	{@const md_classes = `
				bg-blue-100/5
				block
				font-mono
				leading-relaxed
				min-h-full
				pb-6
				pt-5
				px-5
				resize-none
				rounded-md
				focus-outline-none
				w-full
				xl-max-w-960px
				${classes}`}
	{#if editor}
		<textarea
			class="
				{md_classes}"
			bind:value={editor.markdownCurrent}
			rows={Math.max(16, editor.markdownCurrent.split("\n").length + 2)}
			spellcheck="false"
			autocomplete="off"
			data-1p-ignore
			data-lpignore="true"
			data-bwignore
			placeholder="Enter idea notes here, app will save as you type."></textarea>
	{:else}
		<textarea class={md_classes} rows={Math.max(16, markdown.split("\n").length + 2)} disabled
			>{markdown}</textarea
		>
	{/if}
{/if}
