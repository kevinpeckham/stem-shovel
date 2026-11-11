import type { ComponentProps } from "svelte";
import type ContextMenu from "#lib/components/ContextMenu.svelte";
import type SongDocPanel from "#lib/components/SongDocPanel.svelte";
import { MAIN_ONLY } from "#lib/constants/arrangements.js";
import { saveDoc, setChartColumns } from "#lib/remote/songs.remote.js";
import { ChartKeyChoice } from "#lib/state/chartKey.svelte.js";
import { ChordDialectChoice, type ChordDialect } from "#lib/state/chordDialect.svelte.js";
import { notify } from "#lib/state/notifications.svelte.js";
import type { SongChordDraft } from "#lib/state/songChordDraft.svelte.js";
import { DEFAULT_DOC_MONO, loadDocMono, saveDocMono } from "#lib/utils/docMonoPreference.js";
import { errorMessage } from "#lib/utils/errorMessage.js";
import type { ChartColumns } from "#lib/val/ChartColumnsSchema.js";
import type { SongDocKind, SongDocSaveKind } from "#lib/val/SongDocKindSchema.js";

// Chart / Lyrics / Notes toggle for the read view. Starts on the first with content.
// Lyrics first, the panel's default tab (Kevin, 2026-10-06).
// The Docs panel holds the documents; the comments, the chat and the attachments are panels of their own (Kevin).
export const DOC_KINDS = ["lyrics", "chart", "notes"] as const;
export const DOC_LABELS = { chart: "Chart", lyrics: "Lyrics", notes: "Notes" } as const;
export const DOC_HINTS = {
	chart:
		"Chords and arrangement in barmark: bars between pipes, ## Name for a section; the full guide is at barmark.dev.",
	lyrics:
		"Lyrics. One line per lyric line; a blank line starts a new section, and a heading names it (Verse, Chorus).",
	notes: "Notes. Anything about the song — ideas, references, production to-dos, who plays what.",
} as const;
/**
 * The editor's panes while editing in the panel. The chart has no Rich Text
 * pane (MarkdownDocEditor's `plain`: barmark is plain text), so the song page
 * shows this choice only for lyrics and notes.
 */
export const DOC_VIEWS = [
	{ id: "rendered", name: "Rich Text" },
	{ id: "markdown", name: "Markdown" },
] as const;

/** Docked in its column, floating from lg, or minimized to the action row's button (the Docs panel and the player alike). */
export type PanelMode = "docked" | "floating" | "minimised";
type MenuItems = NonNullable<ComponentProps<typeof ContextMenu>["items"]>;

const DOCS_MODE_KEY = "stemshovel.song.docs-mode";
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
	/** How the chart sizes its columns, the ⋯ menu's "Size columns per row". */
	chartColumns: ChartColumns;
	/** The arrangement the player shows (docs/arrangements.md): on an alternate the AI's draft and Generate stay Main's until phase 3. */
	arrangementId?: string | null;
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
	/** Detect chords and the AI's chart draft, for the ⋯ menu's draft and generate items. */
	chordDraft: () => Pick<
		SongChordDraft,
		"draftBusy" | "chordBusy" | "progress" | "cancelDraft" | "draftFromPanel" | "generateChart"
	>;
	/** The player's engine status, null before it mounts (the draft needs every stem decoded). */
	engineStatus: () => string | null;
	/** The song has a bar grid (a tempo and a time signature). */
	hasGrid: () => boolean;
	/** The ⋯ menu's History: the page's history panel opens on the document. */
	onhistory: (target: DocHistoryTarget) => void;
	/** After the chart's column sizing is saved: the page's data again (refreshAll), so the server-drawn chart redraws. */
	onsaved: () => Promise<void>;
}

/**
 * The song page's Docs panel (chart, lyrics, notes): which document shows,
 * whether it is open for editing and in which pane, monospace per kind, the
 * Notes tab's Project / Mine, the panel's docked/floating/minimized mode,
 * and its ⋯ menu. The editor binds onto `editor`. The Chart tab is the
 * song's one chart; its score files live in the Attachments panel. Choices
 * are remembered per browser; `load()` reads them once mounted.
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
	/** Mine picked on the Notes tab. */
	notesChoice = $state(false);
	editor: SongDocPanel | null = null;
	/** The Chords view's spelling, this browser's choice (shared with the home page's demo). */
	#spelling = new ChordDialectChoice();
	/** The Chords view's key (a viewing choice: the chart text stays as written), this browser's choice per song. */
	#key: ChartKeyChoice;
	#restore: Exclude<PanelMode, "minimised"> = "docked";
	#opts: SongDocsOptions;

	constructor(opts: SongDocsOptions) {
		this.#opts = opts;
		this.#key = new ChartKeyChoice(opts.song().id);
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
	/** The Key menu's state: the chart drawn transposed, a viewing choice. */
	get chartKey(): ChartKeyChoice {
		return this.#key;
	}
	/** The renderer's `numerals` for the chosen spelling, null for chord names. */
	get numerals(): "nashville" | "roman" | null {
		return this.#spelling.numerals;
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

	/** Read this browser's choices (from onMount). */
	load() {
		this.mono = loadDocMono();
		this.#spelling.load();
		this.#key.load();
		try {
			const mode = localStorage.getItem(DOCS_MODE_KEY);
			if (mode === "docked" || mode === "floating" || mode === "minimised") this.mode = mode;
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

	/** The panel back and on the Chart tab: where "Use as chart" puts its draft card. */
	async showChart() {
		if (this.mode === "minimised") await this.setMode(this.#restore);
		await this.show("chart");
	}

	/** The Chords view's spelling, this browser's choice. */
	get chordDialect(): ChordDialect {
		return this.#spelling.dialect;
	}
	set chordDialect(dialect: ChordDialect) {
		this.#spelling.dialect = dialect;
	}
	/** The chord spelling menu's trigger: the current spelling, short. */
	get chordDialectShort() {
		return this.#spelling.short;
	}
	/** The chord spelling menu: the three spellings, the current one checked. */
	get chordDialectItems(): MenuItems {
		return this.#spelling.items;
	}
	/** The view redraws in place (under an open editor too), so nothing closes. */
	setChordDialect(dialect: ChordDialect) {
		this.#spelling.set(dialect);
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

	/**
	 * The chart's column sizing switched and saved for the band (`row` or
	 * `shared`), then the page's data again: the chart is drawn on the server.
	 */
	async toggleChartColumns() {
		const o = this.#opts;
		const song = o.song();
		try {
			await setChartColumns({
				id: song.id,
				columns: song.chartColumns === "row" ? "shared" : "row",
			});
			await o.onsaved();
		} catch (e) {
			notify(errorMessage(e), { kind: "error" });
		}
	}

	/** The ⋯ menu: monospace for a document, its history, the chart's column sizing and AI draft. */
	get menuItems(): MenuItems {
		const o = this.#opts;
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
		if (this.panel === "chart" && o.canEdit())
			items.push({
				id: "columns",
				label: "Size columns per row",
				iconClass: o.song().chartColumns === "row" ? "i-ph-check" : "i-ph-check invisible",
				title: "Each row sizes its own bars, so one busy bar does not widen the whole section",
				action: () => void this.toggleChartColumns(),
			});
		if (this.panel === "chart" && o.aiAvailable()) items.push(...this.#draftItems());
		return items;
	}

	/** The chart's AI draft: Draft (and Generate on an empty chart), or the run's progress and Cancel. */
	#draftItems(): MenuItems {
		const o = this.#opts;
		const draft = o.chordDraft();
		if (draft.draftBusy || draft.chordBusy || draft.progress)
			return [
				{ id: "ai", kind: "divider" },
				{
					id: "busy",
					kind: "notice",
					notice: draft.progress ?? (draft.draftBusy ? "Drafting…" : String(draft.chordBusy)),
				},
				{ id: "cancel", label: "Cancel", iconClass: "i-ph-x", action: () => draft.cancelDraft() },
			];
		const status = o.engineStatus();
		const blocked = this.#blocked(status, true);
		return [
			{ id: "ai", kind: "divider" },
			{
				id: "draft",
				label: "Draft chart with AI",
				iconClass: "i-ph-sparkle",
				disabled: !!blocked,
				title:
					blocked ??
					"Transcribe the stems and have the AI draft sections, progressions and a chart",
				action: () => draft.draftFromPanel(),
			},
			...this.#generateItems(status),
		];
	}

	/** Why a run from the stems cannot start now: an alternate arrangement (Main's until phase 3), no grid where it needs one, or stems still decoding; null when it can. */
	#blocked(status: string | null, needsGrid: boolean): string | null {
		if (this.#opts.song().arrangementId) return MAIN_ONLY;
		if (needsGrid && !this.#opts.hasGrid())
			return "Needs a tempo and a time signature first (song settings)";
		return status === "ready" ? null : "Available once every stem has decoded";
	}

	/** "Generate chart from the stems": the whole run, saved to the song, so only to an editor and where there is no chart to replace. */
	#generateItems(status: string | null): MenuItems {
		const o = this.#opts;
		if (o.docs().chart || !o.canEdit()) return [];
		const draft = o.chordDraft();
		const blocked = this.#blocked(status, false);
		return [
			{
				id: "generate",
				label: "Generate chart from the stems",
				iconClass: "i-ph-magic-wand",
				disabled: !!blocked,
				title:
					blocked ??
					"Set the tempo when it is missing, detect the chords, place the bar lines, draft the chart and save it with its sections",
				action: () => void draft.generateChart(),
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
