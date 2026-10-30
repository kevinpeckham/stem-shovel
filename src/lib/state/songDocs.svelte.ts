import { tick, type ComponentProps } from "svelte";
import type ContextMenu from "#lib/components/ContextMenu.svelte";
import type SongDocPanel from "#lib/components/SongDocPanel.svelte";
import type SongNotationPanel from "#lib/components/SongNotationPanel.svelte";
import { saveDoc } from "#lib/remote/songs.remote.js";
import type { SongChordDraft } from "#lib/state/songChordDraft.svelte.js";
import { DEFAULT_DOC_MONO, loadDocMono, saveDocMono } from "#lib/utils/docMonoPreference.js";
import type { SongDocKind, SongDocSaveKind } from "#lib/val/SongDocKindSchema.js";

// Chart / Lyrics / Notes toggle for the read view. Starts on the first with content.
// Lyrics first, the panel's default tab (Kevin, 2026-10-06).
// The Docs panel holds the documents; the comments, the chat and the attachments are panels of their own (Kevin).
export const DOC_KINDS = ["lyrics", "chart", "notes"] as const;
export const DOC_LABELS = { chart: "Chart", lyrics: "Lyrics", notes: "Notes" } as const;
export const DOC_HINTS = {
	chart:
		"Chords and arrangement. Select text for formatting; the ⋮ next to a block changes its type. Use a code block for chord grids so spacing is kept.",
	lyrics:
		"Lyrics. One line per lyric line; a blank line starts a new section, and a heading names it (Verse, Chorus).",
	notes: "Notes. Anything about the song — ideas, references, production to-dos, who plays what.",
} as const;
/** The editor's panes while editing in the panel. */
export const DOC_VIEWS = [
	{ id: "rendered", name: "Rich Text" },
	{ id: "markdown", name: "Markdown" },
] as const;

/** Docked in its column, floating from lg, or minimized to the action row's button (the Docs panel and the player alike). */
export type PanelMode = "docked" | "floating" | "minimised";
type ChartMode = "text" | "notation";
type MenuItems = NonNullable<ComponentProps<typeof ContextMenu>["items"]>;

const DOCS_MODE_KEY = "stemshovel.song.docs-mode";
const CHART_MODE_KEY = "stemshovel.song.chart-mode";
const NOTES_MINE_KEY = "stemshovel.song.notes-mine";

/** What the Docs panel reads of the song (the page's data). */
export interface DocsSong {
	id: string;
	chartMarkdown: string;
	lyricsMarkdown: string;
	notesMarkdown: string;
	chartVersion: number;
	lyricsVersion: number;
	notesVersion: number;
}

/** The history panel's subject for a document (the page's DocHistoryPanel). */
export interface DocHistoryTarget {
	kind: "doc";
	songId: string;
	doc: SongDocSaveKind;
	label: string;
	current?: string;
}

/** What the page supplies, as functions since SvelteKit reuses the page between songs. */
export interface SongDocsOptions {
	song: () => DocsSong;
	/** The rendered documents (empty when a document has no content). */
	docs: () => Record<SongDocKind, string | null>;
	/** The signed-in user's own note on the song, when there is one. */
	myNote: () => { markdown: string; html: string; version: number } | null | undefined;
	signedIn: () => boolean;
	canEdit: () => boolean;
	aiAvailable: () => boolean;
	/** The ready notation files (MusicXML and PDFs marked as notation). */
	notationCount: () => number;
	/** Detect chords and the AI's chart draft, for the ⋯ menu's draft item. */
	chordDraft: () => Pick<
		SongChordDraft,
		"draftBusy" | "chordBusy" | "cancelDraft" | "draftFromPanel"
	>;
	/** The player's engine status, null before it mounts (the draft needs every stem decoded). */
	engineStatus: () => string | null;
	/** The song has a bar grid (a tempo and a time signature). */
	hasGrid: () => boolean;
	/** The ⋯ menu's History: the page's history panel opens on the document. */
	onhistory: (target: DocHistoryTarget) => void;
}

/**
 * The song page's Docs panel (chart, lyrics, notes): which document shows,
 * whether it is open for editing and in which pane, monospace per kind, the
 * Chart tab's Text / Notation mode, the Notes tab's Project / Mine, the
 * panel's docked/floating/minimized mode, and its ⋯ menu. The editor and the
 * notation panel bind onto `editor` and `notation`. Choices are remembered
 * per browser; `load()` reads them once mounted.
 */
export class SongDocs {
	/** The document shown. */
	panel = $state<SongDocKind>("lyrics");
	/** In-panel editing (SongDocPanel): the panel autosaves; closing goes through its close(), which flushes first. */
	editing = $state(false);
	/** The editor pane while editing, chosen on the panel. */
	view = $state<"rendered" | "markdown">("rendered");
	/** Monospace or regular text per document kind, this browser's choice (docMonoPreference). */
	mono = $state({ ...DEFAULT_DOC_MONO });
	mode = $state<PanelMode>("docked");
	/** The Chart tab's mode as picked; until then, notation when there is no chart text but there is notation. */
	chartChoice = $state<ChartMode | null>(null);
	/** Mine picked on the Notes tab. */
	notesChoice = $state(false);
	editor: SongDocPanel | null = null;
	notation: SongNotationPanel | null = null;
	#restore: Exclude<PanelMode, "minimised"> = "docked";
	#opts: SongDocsOptions;

	constructor(opts: SongDocsOptions) {
		this.#opts = opts;
		// Start on the first document with content.
		const docs = opts.docs();
		this.panel = DOC_KINDS.find((k) => docs[k]) ?? "lyrics";
	}

	get doc() {
		return this.panel;
	}
	/** A document save in flight (the panel saves through the shared remote form). */
	get saving() {
		return !!saveDoc.pending;
	}
	get chartMode(): ChartMode {
		return (
			this.chartChoice ??
			(!this.#opts.docs().chart && this.#opts.notationCount() > 0 ? "notation" : "text")
		);
	}
	get notationShown() {
		return this.panel === "chart" && this.chartMode === "notation";
	}
	/** Signed in, a note of one's own exists to show, empty until the first save. */
	get canHaveNote() {
		return this.#opts.signedIn();
	}
	get myNote() {
		return this.#opts.myNote() ?? { markdown: "", html: "", version: 0 };
	}
	get notesMine() {
		return this.panel === "notes" && this.notesChoice && this.canHaveNote;
	}
	/** The shown document's text as saved, and its version. */
	get text() {
		const song = this.#opts.song();
		return { chart: song.chartMarkdown, lyrics: song.lyricsMarkdown, notes: song.notesMarkdown }[
			this.doc
		];
	}
	get version() {
		const song = this.#opts.song();
		return { chart: song.chartVersion, lyrics: song.lyricsVersion, notes: song.notesVersion }[
			this.doc
		];
	}

	/** A tab's label with its count, as the player's tabs: the Chart's uploads, or 1 for chart text with none. */
	tabLabel(kind: SongDocKind) {
		const count =
			kind === "chart" ? this.#opts.notationCount() || (this.#opts.docs().chart ? 1 : 0) : 0;
		return count ? `${DOC_LABELS[kind]} (${count})` : DOC_LABELS[kind];
	}

	/** Read this browser's choices (from onMount). */
	load() {
		this.mono = loadDocMono();
		try {
			const mode = localStorage.getItem(DOCS_MODE_KEY);
			if (mode === "docked" || mode === "floating" || mode === "minimised") this.mode = mode;
			const cm = localStorage.getItem(CHART_MODE_KEY);
			if (cm === "text" || cm === "notation") this.chartChoice = cm;
			this.notesChoice = localStorage.getItem(NOTES_MINE_KEY) === "1";
		} catch {
			// Private mode: docked.
		}
	}

	/** Close an open editor (it flushes first). */
	async closeEditor() {
		if (this.editing) await this.editor?.close();
		this.editing = false;
	}

	/** Switch the shown document, closing an open editor first. */
	async show(kind: SongDocKind) {
		if (kind === this.panel) return;
		await this.closeEditor();
		this.panel = kind;
	}

	async setMode(mode: PanelMode) {
		if (mode === "minimised") {
			if (this.mode !== "minimised") this.#restore = this.mode;
			// The panel unmounts: an open editor flushes first.
			await this.closeEditor();
		}
		this.mode = mode;
		remember(DOCS_MODE_KEY, mode);
	}
	/** The action row's Docs button: minimized, or back the way it was. */
	toggle() {
		void this.setMode(this.mode === "minimised" ? this.#restore : "minimised");
	}

	async setChartMode(mode: ChartMode) {
		if (mode === this.chartMode) return;
		await this.closeEditor();
		this.chartChoice = mode;
		remember(CHART_MODE_KEY, mode);
	}

	async setNotesMine(on: boolean) {
		if (on === this.notesChoice) return;
		await this.closeEditor();
		this.notesChoice = on;
		remember(NOTES_MINE_KEY, on ? "1" : "0");
	}

	toggleMono(kind: SongDocKind) {
		this.mono = { ...this.mono, [kind]: !this.mono[kind] };
		saveDocMono(this.mono);
	}

	/** The panel back, the Chart tab in notation mode, mounted: the notation panel. */
	async #showNotation() {
		if (this.mode === "minimised") await this.setMode(this.#restore);
		await this.show("chart");
		await this.setChartMode("notation");
		await tick();
		return this.notation;
	}
	/** The notation picker, from the Uploads menu. */
	async pickNotation() {
		(await this.#showNotation())?.pick();
	}
	/** Files the Attachments panel hands over as notation. */
	async uploadNotation(files: File[]) {
		await (await this.#showNotation())?.upload(files);
	}
	/** A score's chart read opened for correction: the Chart tab's notation view, then that read. */
	async showRead(fileId: string) {
		this.panel = "chart";
		this.chartChoice = "notation";
		await tick();
		void this.notation?.showRead(fileId);
	}

	/** The ⋯ menu: monospace for a document, its history, the chart's AI draft, the notation's upload; a placeholder when empty, so the toolbar never shifts. */
	get menuItems(): MenuItems {
		const o = this.#opts;
		if (this.notationShown)
			return o.canEdit()
				? [
						{
							id: "upload-notation",
							label: "Upload Notation",
							iconClass: "i-ph-music-notes-simple",
							title: "MusicXML or PDF: one or more files",
							action: () => this.notation?.pick(),
						},
					]
				: [{ id: "nothing", kind: "notice", notice: "Nothing to do here yet" }];
		const doc = this.doc;
		const items: MenuItems = [
			{
				id: "mono",
				label: "Monospace",
				iconClass: this.mono[doc] ? "i-ph-check" : "i-ph-check invisible",
				title: "Fixed-width text, so chord grids line up",
				action: () => this.toggleMono(doc),
			},
			{
				id: "history",
				label: "History",
				iconClass: "i-ph-clock-counter-clockwise",
				title: "Earlier versions of this text, to view or restore",
				action: () => {
					const mine = this.notesMine;
					o.onhistory({
						kind: "doc",
						songId: o.song().id,
						doc: mine ? "mynotes" : doc,
						label: mine ? "your notes" : `the ${doc}`,
						// The text as saved now, for "Changes" on a version (DocHistoryPanel.svelte).
						current: mine ? this.myNote.markdown : this.text,
					});
				},
			},
		];
		if (this.panel === "chart" && o.aiAvailable()) items.push(...this.#draftItems());
		return items;
	}

	/** The chart's AI draft: Draft, or the run's progress and Cancel. */
	#draftItems(): MenuItems {
		const o = this.#opts;
		const draft = o.chordDraft();
		if (draft.draftBusy || draft.chordBusy)
			return [
				{ id: "ai", kind: "divider" },
				{
					id: "busy",
					kind: "notice",
					notice: draft.draftBusy ? "Drafting…" : String(draft.chordBusy),
				},
				{ id: "cancel", label: "Cancel", iconClass: "i-ph-x", action: () => draft.cancelDraft() },
			];
		const status = o.engineStatus();
		return [
			{ id: "ai", kind: "divider" },
			{
				id: "draft",
				label: "Draft chart with AI",
				iconClass: "i-ph-sparkle",
				disabled: status !== "ready" || !o.hasGrid(),
				title: !o.hasGrid()
					? "Needs a tempo and a time signature first (song settings)"
					: status !== "ready"
						? "Available once every stem has decoded"
						: "Transcribe the stems and have the AI draft sections, progressions and a chart",
				action: () => draft.draftFromPanel(),
			},
		];
	}
}

/** Remember a choice in this browser. */
function remember(key: string, value: string) {
	try {
		localStorage.setItem(key, value);
	} catch {
		// Private mode: the choice lasts for this page only.
	}
}
