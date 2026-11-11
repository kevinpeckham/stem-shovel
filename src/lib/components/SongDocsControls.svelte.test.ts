import { fireEvent, render, screen } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";

/** The Docs panel's header over a real SongDocs: the documents as tabs, Edit / Done, the ⋯ menu's spinner, and the pop-out / dock button. */
vi.mock("#lib/remote/songs.remote.js", () => ({ saveDoc: { pending: 0 } }));

const { default: SongDocsControls } = await import("./SongDocsControls.svelte");
const { SongDocs } = await import("#lib/state/songDocs.svelte.js");

const html = { chart: "<p>chart</p>", lyrics: "", notes: "" };

function setup({ canEdit = true, busy = false } = {}) {
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
		docs: () => html,
		myNote: () => null,
		signedIn: () => true,
		canEdit: () => canEdit,
		aiAvailable: () => false,
		chordDraft: () => ({}) as never,
		engineStatus: () => null,
		hasGrid: () => false,
		onhistory: () => {},
		onsaved: async () => {},
	});
	render(SongDocsControls, { docs, canEdit, docsHtml: html, busy });
	return docs;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("SongDocsControls", () => {
	test("the documents as tabs; the first with content selected", () => {
		setup();
		const tabs = screen.getAllByRole("tab");
		expect(tabs.map((t) => t.textContent)).toEqual(["Lyrics", "Chart", "Notes"]);
		expect(screen.getByRole("tab", { name: "Chart" })).toHaveAttribute("aria-selected", "true");
	});

	test("a tab shows its document", async () => {
		const docs = setup();
		await fireEvent.click(screen.getByRole("tab", { name: "Lyrics" }));
		expect(docs.panel).toBe("lyrics");
	});

	test("Edit opens the editor; an empty document's button is a plus", async () => {
		const docs = setup();
		const edit = screen.getByRole("button", { name: "Edit the chart" });
		expect(edit.querySelector(".i-ph-pencil")).not.toBeNull();
		await fireEvent.click(edit);
		expect(docs.editing).toBe(true);
		flushSync();
		expect(screen.getByRole("button", { name: "Done editing the chart" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		docs.editing = false;
		await docs.show("lyrics");
		flushSync();
		expect(
			screen.getByRole("button", { name: "Edit the lyrics" }).querySelector(".i-ph-plus"),
		).not.toBeNull();
	});

	test("a visitor's edit row is hidden", () => {
		setup({ canEdit: false });
		const edit = screen.getByRole("button", { name: "Edit the chart", hidden: true });
		expect(edit.parentElement).toHaveClass("hidden");
	});

	test("the ⋯ button spins while busy", () => {
		setup({ busy: true });
		expect(document.querySelector(".i-ph-circle-notch.animate-spin")).not.toBeNull();
	});

	test("pop out, then dock", async () => {
		const docs = setup();
		await fireEvent.click(screen.getByLabelText("Pop out the docs"));
		expect(docs.mode).toBe("floating");
		flushSync();
		await fireEvent.click(screen.getByLabelText("Dock the docs"));
		expect(docs.mode).toBe("docked");
	});
});
