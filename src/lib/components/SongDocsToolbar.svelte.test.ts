import { render, screen } from "@testing-library/svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

/** The Docs panel's sticky toolbar over a real SongDocs: which groups show by tab and editing. */
vi.mock("#lib/remote/songs.remote.js", () => ({ saveDoc: { pending: 0 } }));

const { default: SongDocsToolbar } = await import("./SongDocsToolbar.svelte");
const { SongDocs } = await import("#lib/state/songDocs.svelte.js");
type Kind = "chart" | "lyrics" | "notes";

function setup({ panel = "chart" as Kind, editing = false, signedIn = true } = {}) {
	vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {} });
	const docs = new SongDocs({
		song: () => ({
			id: "song1",
			chartMarkdown: "| C |",
			lyricsMarkdown: "",
			notesMarkdown: "",
			chartVersion: 1,
			lyricsVersion: 0,
			notesVersion: 0,
			chartColumns: "shared",
		}),
		docs: () => ({ chart: "<p>chart</p>", lyrics: "", notes: "" }),
		myNote: () => null,
		signedIn: () => signedIn,
		canEdit: () => true,
		aiAvailable: () => false,
		chordDraft: () => ({}) as never,
		engineStatus: () => null,
		hasGrid: () => false,
		onhistory: () => {},
		onsaved: async () => {},
	});
	docs.panel = panel;
	docs.editing = editing;
	render(SongDocsToolbar, { docs, chartMarkdown: "| C |" });
	return docs;
}

const groups = () => screen.queryAllByRole("radiogroup").map((g) => g.getAttribute("aria-label"));

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("SongDocsToolbar", () => {
	test("the Chart tab: one chart, the spelling and the key, no Chords / Engraving choice", () => {
		setup();
		expect(groups()).toEqual([]);
		expect(screen.queryByRole("radio", { name: /Engraving/ })).toBeNull();
		expect(screen.getByTitle("Chord spelling")).toBeInTheDocument();
		expect(screen.getByLabelText(/^Key: /)).toBeInTheDocument();
	});

	test("the lyrics, read: no toolbar", () => {
		setup({ panel: "lyrics" });
		expect(groups()).toEqual([]);
		expect(document.querySelector(".sticky")).toBeNull();
	});

	test("the lyrics, editing: the editor's view", () => {
		setup({ panel: "lyrics", editing: true });
		expect(groups()).toEqual(["Editor view"]);
		expect(screen.getByRole("radio", { name: "Rich Text" })).toHaveAttribute(
			"aria-checked",
			"true",
		);
	});

	test("the notes, signed in: Project / Mine", () => {
		setup({ panel: "notes" });
		expect(groups()).toEqual(["Whose notes"]);
		expect(screen.getByRole("radio", { name: "Project" })).toHaveAttribute("aria-checked", "true");
	});

	test("the notes, signed out: no toolbar", () => {
		setup({ panel: "notes", signedIn: false });
		expect(groups()).toEqual([]);
	});
});
