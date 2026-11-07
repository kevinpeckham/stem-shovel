import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "svelte";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

/**
 * The notation tiles' "Chart from score" (docs/uploads-and-blob.md,
 * "Notation"): the ⋯ menu item on a MusicXML tile for an editor, what it
 * hands the page, and what it says when the score gives nothing or the call
 * fails. The remote functions, the upload helpers and Verovio are doubles
 * (no tile is opened, so nothing is engraved).
 */
const h = vi.hoisted(() => ({
	refreshAll: vi.fn(async () => {}),
	notify: vi.fn(),
	chartFromScore: vi.fn(),
	page: { url: new URL("https://www.stemshovel.com/mmkk/projects/p/s") },
}));
vi.mock("$app/state", () => ({ page: h.page }));
vi.mock("$app/navigation", () => ({ refreshAll: h.refreshAll }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("#lib/remote/files.remote.js", () => ({
	chartFromScore: h.chartFromScore,
	clearChartReadOfFile: vi.fn(),
	deleteFile: vi.fn(),
	readChartOfFile: vi.fn(),
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
/** The labels of the open ContextMenu's items. */
const menuItems = () => {
	const open = [...document.querySelectorAll<HTMLElement>("[popover]")].find(
		(el) => el.style.display !== "none",
	);
	return [...(open?.querySelectorAll("button, a") ?? [])].map((el) => el.textContent?.trim());
};

beforeAll(installFakePopover);
beforeEach(() => vi.clearAllMocks());

describe("Chart from score", () => {
	test("on a MusicXML tile for an editor; not on a PDF, nor for a viewer", async () => {
		const user = userEvent.setup();
		const { unmount } = render(SongNotationPanel, base());
		await user.click(screen.getByRole("button", { name: "Actions for Lead sheet" }));
		expect(menuItems()).toContain("Chart from score");
		await user.keyboard("{Escape}");
		await user.click(screen.getByRole("button", { name: "Actions for Old chart" }));
		expect(menuItems()).not.toContain("Chart from score");
		unmount();
		render(SongNotationPanel, base({ canEdit: false }));
		await user.click(screen.getByRole("button", { name: "Actions for Lead sheet" }));
		expect(menuItems()).not.toContain("Chart from score");
	});

	test("hands the page the chart, named after the tile", async () => {
		const diagnostics = [{ level: "warning", message: "Lyrics were left out." }];
		h.chartFromScore.mockResolvedValue({ chart: "| C | G |", chartHtml: "<p>c</p>", diagnostics });
		const onchart = vi.fn();
		const user = userEvent.setup();
		render(SongNotationPanel, base({ onchart }));
		await user.click(screen.getByRole("button", { name: "Actions for Lead sheet" }));
		await user.click(screen.getByRole("button", { name: "Chart from score" }));
		await vi.waitFor(() => expect(onchart).toHaveBeenCalled());
		expect(h.chartFromScore).toHaveBeenCalledWith({ id: "score-1" });
		expect(onchart).toHaveBeenCalledWith({
			chart: "| C | G |",
			chartHtml: "<p>c</p>",
			diagnostics,
			source: "Lead sheet",
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
		});
		const onchart = vi.fn();
		const user = userEvent.setup();
		render(SongNotationPanel, base({ onchart }));
		await user.click(screen.getByRole("button", { name: "Actions for Lead sheet" }));
		await user.click(screen.getByRole("button", { name: "Chart from score" }));
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
		await user.click(screen.getByRole("button", { name: "Actions for Lead sheet" }));
		await user.click(screen.getByRole("button", { name: "Chart from score" }));
		await vi.waitFor(() =>
			expect(h.notify).toHaveBeenCalledWith("The score could not be read", { kind: "error" }),
		);
		expect(onchart).not.toHaveBeenCalled();
	});
});
