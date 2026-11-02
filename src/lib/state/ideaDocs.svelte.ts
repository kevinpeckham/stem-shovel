/** An idea's two documents (docs/barmark-integration-audit.md item 9). */
export type IdeaDoc = "notes" | "chart";
type Docs = Record<IdeaDoc, string>;

const NONE: Docs = { notes: "", chart: "" };

/**
 * An idea's notes and barmark chart as a page knows them (their panels
 * autosave to the idea), which of them the panel shows, and the key that
 * re-seeds the panel when another idea loads or a document is cleared.
 */
export class IdeaDocsState {
	notes = $state("");
	chart = $state("");
	doc = $state<IdeaDoc>("notes");
	/** Bumped to re-seed the panel (another idea, a clear). */
	key = $state(0);

	/** Another idea's documents, or none for a new idea. */
	seed(from: Docs = NONE) {
		this.notes = from.notes;
		this.chart = from.chart;
		this.key++;
	}

	/** Empties the shown document and answers which it was (the page saves the emptied text). */
	empty(): IdeaDoc {
		const doc = this.doc;
		this[doc] = "";
		this.key++;
		return doc;
	}

	/** The panel's title for the idea: "Notes for “…”" or "Chart for “…”". */
	title(name: string) {
		return `${this.doc === "chart" ? "Chart" : "Notes"} for “${name}”`;
	}
}
