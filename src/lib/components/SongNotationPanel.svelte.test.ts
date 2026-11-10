import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "svelte";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The score tiles' "Use as chart" (docs/uploads-and-blob.md, "Notation"):
 * the button on a MusicXML tile for an editor (and on a PDF when the AI may
 * read it), what it hands the page, and what it says when the score gives
 * nothing or the call fails. The remote functions, the upload helpers and
 * Verovio are doubles (no tile is opened, so nothing is engraved).
 */
const h = vi.hoisted(() => ({
	refreshAll: vi.fn(async () => {}),
	notify: vi.fn(),
	chartFromScore: vi.fn(),
	readChartOfFile: vi.fn(),
	page: { url: new URL("https://www.stemshovel.com/mmkk/projects/p/s") },
}));
vi.mock("$app/state", () => ({ page: h.page }));
vi.mock("$app/navigation", () => ({ refreshAll: h.refreshAll }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("#lib/remote/files.remote.js", () => ({
	chartFromScore: h.chartFromScore,
	clearChartReadOfFile: vi.fn(),
	deleteFile: vi.fn(),
	readChartOfFile: h.readChartOfFile,
	saveChartReadOfFile: vi.fn(),
	updateFile: vi.fn(),
}));
vi.mock("#lib/remote/notation.remote.js", () => ({
	deleteNotation: vi.fn(),
	updateNotation: vi.fn(),
}));
vi.mock("#lib/upload.js", () => ({
	postJson: vi.fn(),
	uploadFile: vi.fn(),
	uploadNotationFile: vi.fn(),
}));
vi.mock("#lib/utils/renderNotation.js", () => ({ renderNotation: vi.fn() }));
vi.mock("#lib/utils/notationThumbnail.js", () => ({ notationThumbnail: vi.fn() }));
vi.mock("#lib/utils/shortenShareLink.js", () => ({
	shortenShareLink: vi.fn(async (u: string) => u),
}));

const { default: SongNotationPanel } = await import("./SongNotationPanel.svelte");
type Props = ComponentProps<typeof SongNotationPanel>;

const score = {
	id: "score-1",
	title: "Lead sheet",
	description: "",
	filename: "lead.musicxml",
	format: "musicxml" as const,
	sizeBytes: 4096,
	pageCount: 1,
	url: "https://store/lead.musicxml",
	thumbnailUrl: "https://store/lead.webp",
	shareCode: "code-score",
	status: "ready",
	pdfStatus: null,
};
const pdf = {
	id: "pdf-1",
	kind: "pdf" as const,
	title: "Old chart",
	description: "",
	filename: "old.pdf",
	sizeBytes: 2048,
	pageCount: 1,
	url: "https://store/old.pdf",
	thumbnailUrl: null,
	shareCode: "code-pdf",
	status: "ready",
	isNotation: true,
};
const base = (over: Partial<Props> = {}): Props => ({
	songId: "song-1",
	songTitle: "Eat All the Clocks",
	notation: [score],
	pdfs: [pdf],
	canEdit: true,
	...over,
});

beforeAll(installFakePopover);
beforeEach(() => vi.clearAllMocks());

const useAsChart = (name: string) =>
	screen
		.getByRole("listitem", { name })
		.querySelector<HTMLButtonElement>("button[title^='Read this score']");

describe("Use as chart", () => {
	test("on a MusicXML tile for an editor; on a PDF only when the AI may read it; never for a viewer", () => {
		const { unmount } = render(SongNotationPanel, base());
		expect(useAsChart("Lead sheet")).toHaveTextContent("Use as chart");
		expect(useAsChart("Old chart")).toBeNull();
		unmount();
		const again = render(SongNotationPanel, base({ aiAvailable: true }));
		expect(useAsChart("Old chart")).toHaveTextContent("Use as chart");
		again.unmount();
		render(SongNotationPanel, base({ canEdit: false, aiAvailable: true }));
		expect(useAsChart("Lead sheet")).toBeNull();
		expect(screen.queryByText("Upload notation")).toBeNull();
	});

	test("a PDF's read goes to the page as the chart, named after the file", async () => {
		h.readChartOfFile.mockResolvedValue({ text: "| F | C7 |", edited: false, fromModel: false });
		const onchart = vi.fn();
		const user = userEvent.setup();
		render(SongNotationPanel, base({ onchart, aiAvailable: true }));
		await user.click(useAsChart("Old chart")!);
		await vi.waitFor(() => expect(onchart).toHaveBeenCalled());
		expect(h.readChartOfFile).toHaveBeenCalledWith({ id: "pdf-1" });
		expect(onchart).toHaveBeenCalledWith({
			chart: "| F | C7 |",
			chartHtml: "",
			diagnostics: [],
			parts: [],
			id: "pdf-1",
			kind: "file",
			source: "Old chart",
		});
	});

	test("useAsChart reads a file by its kind and id; a file that is gone is false", async () => {
		h.chartFromScore.mockResolvedValue({
			chart: "| C |",
			chartHtml: "",
			diagnostics: [],
			parts: [],
		});
		const onchart = vi.fn();
		const { component } = render(SongNotationPanel, base({ onchart }));
		expect(component.useAsChart("notation", "score-1")).toBe(true);
		await vi.waitFor(() => expect(onchart).toHaveBeenCalled());
		expect(component.useAsChart("file", "score-1")).toBe(false);
		expect(component.useAsChart("notation", "gone")).toBe(false);
	});

	test("hands the page the chart, named after the tile", async () => {
		const diagnostics = [{ level: "warning", message: "Lyrics were left out." }];
		h.chartFromScore.mockResolvedValue({
			chart: "| C | G |",
			chartHtml: "<p>c</p>",
			diagnostics,
			parts: [],
		});
		const onchart = vi.fn();
		const user = userEvent.setup();
		render(SongNotationPanel, base({ onchart }));
		await user.click(useAsChart("Lead sheet")!);
		await vi.waitFor(() => expect(onchart).toHaveBeenCalled());
		expect(h.chartFromScore).toHaveBeenCalledWith({ id: "score-1" });
		expect(onchart).toHaveBeenCalledWith({
			chart: "| C | G |",
			chartHtml: "<p>c</p>",
			diagnostics,
			parts: [],
			source: "Lead sheet",
			notationId: "score-1",
		});
		expect(h.notify).not.toHaveBeenCalled();
	});

	test("no chord symbols but parts of notes: the page gets the empty chart and the parts, no notice", async () => {
		const diagnostics = [
			{ level: "error", message: "no chord symbols; these parts have notes: Piano, Bass." },
		];
		h.chartFromScore.mockResolvedValue({
			chart: "",
			chartHtml: "",
			diagnostics,
			parts: ["Piano", "Bass"],
		});
		const onchart = vi.fn();
		const user = userEvent.setup();
		render(SongNotationPanel, base({ onchart }));
		await user.click(useAsChart("Lead sheet")!);
		await vi.waitFor(() => expect(onchart).toHaveBeenCalled());
		expect(onchart).toHaveBeenCalledWith({
			chart: "",
			chartHtml: "",
			diagnostics,
			parts: ["Piano", "Bass"],
			source: "Lead sheet",
			notationId: "score-1",
		});
		expect(h.notify).not.toHaveBeenCalled();
	});

	test("nothing to chart is an error notification with the first error; no draft", async () => {
		h.chartFromScore.mockResolvedValue({
			chart: "",
			chartHtml: "",
			diagnostics: [
				{ level: "warning", message: "A rhythm snapped." },
				{ level: "error", message: "The file has no measures." },
			],
			parts: [],
		});
		const onchart = vi.fn();
		const user = userEvent.setup();
		render(SongNotationPanel, base({ onchart }));
		await user.click(useAsChart("Lead sheet")!);
		await vi.waitFor(() =>
			expect(h.notify).toHaveBeenCalledWith(
				"Nothing to chart in Lead sheet: The file has no measures.",
				{ kind: "error" },
			),
		);
		expect(onchart).not.toHaveBeenCalled();
	});

	test("a failed call is an error notification", async () => {
		h.chartFromScore.mockRejectedValue(new Error("The score could not be read"));
		const onchart = vi.fn();
		const user = userEvent.setup();
		render(SongNotationPanel, base({ onchart }));
		await user.click(useAsChart("Lead sheet")!);
		await vi.waitFor(() =>
			expect(h.notify).toHaveBeenCalledWith("The score could not be read", { kind: "error" }),
		);
		expect(onchart).not.toHaveBeenCalled();
	});
});
