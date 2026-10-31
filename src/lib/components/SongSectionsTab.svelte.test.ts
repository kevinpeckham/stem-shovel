import { fireEvent, render, screen } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/** The settings' Sections tab over real state instances; the remote functions are never reached. */
vi.mock("#lib/remote/songs.remote.js", () => ({}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));

const { default: SongSectionsTab } = await import("./SongSectionsTab.svelte");
const { SongChanges } = await import("#lib/state/songChanges.svelte.js");
const { SongSections } = await import("#lib/state/songSections.svelte.js");

function setup() {
	const song = {
		id: "song1",
		changes: [],
		sections: [{ name: "Intro", start: 0 }],
	};
	const changes = new SongChanges({
		song: () => song,
		posCtx: () => ({ fps: 25, grid: null }),
		onsaved: async () => {},
	});
	const sections = new SongSections({
		song: () => song,
		grid: () => null,
		hasScore: () => true,
		changes,
		alignChart: async () => ({ reason: "none" }),
		onsaved: async () => {},
	});
	sections.reset();
	const props = { sections, changes, hasScore: true, aiAvailable: true };
	return { sections, props };
}

describe("SongSectionsTab", () => {
	test("Detect, Place from chart and the song's rows", () => {
		const { props } = setup();
		render(SongSectionsTab, { props });
		expect(screen.getByRole("button", { name: "Detect" })).toBeEnabled();
		expect(screen.getByRole("button", { name: "Place from chart" })).toBeEnabled();
		expect(screen.getByLabelText("Section name")).toHaveValue("Intro");
		expect(screen.getByLabelText("Start time")).toHaveValue("00:00:00.00");
		expect(screen.queryByLabelText("Section index")).toBeNull();
	});

	test("the answer card with Use these when the instance holds an answer", () => {
		const { props, sections } = setup();
		sections.answer = { sections: [{ at: 0, name: "Verse" }], notes: "" };
		render(SongSectionsTab, { props });
		expect(screen.getByText(/The AI read the chart and listened/)).toBeTruthy();
		expect(screen.getByText("Verse at 00:00:00.00")).toBeTruthy();
		expect(screen.getByRole("button", { name: "Use these" })).toBeEnabled();
	});

	test("the error line when the instance has one", () => {
		const { props, sections } = setup();
		sections.error = "Something went wrong";
		render(SongSectionsTab, { props });
		expect(screen.getByRole("alert")).toHaveTextContent("Something went wrong");
	});

	test("Add row adds an empty row", async () => {
		const { props } = setup();
		render(SongSectionsTab, { props });
		await fireEvent.click(screen.getByRole("button", { name: "Add row" }));
		expect(
			screen.getAllByLabelText("Section name").map((el) => (el as HTMLInputElement).value),
		).toEqual(["Intro", ""]);
	});
});
