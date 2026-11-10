import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/**
 * The Attachments panel on the song page: hidden until opened, the upload
 * button for an editor, the Scores section above the other attachments,
 * and the calls the page makes (the Uploads menu's pickers, a score's read,
 * Import from a score, Read again), each opening the panel first. The files
 * and scores panels are stand-ins exposing their calls.
 */
const h = vi.hoisted(() => ({
	pick: vi.fn(),
	pickNotation: vi.fn(),
	showRead: vi.fn(async () => {}),
	useAsChart: vi.fn(() => true),
	chartMidi: vi.fn(async () => {}),
	scoresProps: null as Record<string, unknown> | null,
	filesProps: null as Record<string, unknown> | null,
}));
vi.mock("#lib/components/SongFilesPanel.svelte", () => ({
	default: (_a: unknown, props: Record<string, unknown>) => {
		h.filesProps = props;
		return { pick: h.pick };
	},
}));
vi.mock("#lib/components/SongNotationPanel.svelte", () => ({
	default: (_a: unknown, props: Record<string, unknown>) => {
		h.scoresProps = props;
		return { pick: h.pickNotation, showRead: h.showRead, useAsChart: h.useAsChart };
	},
}));
vi.mock("#lib/state/midiChart.svelte.js", () => ({
	MidiChart: class {
		chart = h.chartMidi;
	},
}));

const { default: SongAttachmentsPanel } = await import("./SongAttachmentsPanel.svelte");

const pdf = (id: string, isNotation: boolean, kind = "pdf") => ({
	id,
	kind,
	title: id,
	description: "",
	filename: `${id}.pdf`,
	sizeBytes: 1,
	pageCount: null,
	url: `https://store/${id}`,
	thumbnailUrl: null,
	shareCode: id,
	status: "ready",
	isNotation,
});

function setup({
	open = false,
	canEdit = true,
	files = [pdf("scan", true), pdf("photo", false)],
} = {}) {
	vi.clearAllMocks();
	const onchart = vi.fn();
	const r = render(SongAttachmentsPanel, {
		open,
		songId: "s1",
		songTitle: "Letter Lands",
		files: files as never,
		notation: [],
		canEdit,
		onchart,
	});
	return { ...r, onchart };
}
const wrapper = (c: HTMLElement) => (c.firstElementChild as HTMLElement).className;

describe("SongAttachmentsPanel", () => {
	test("closed, the wrapper is hidden", () => {
		const { container } = setup();
		expect(wrapper(container)).toContain("hidden");
	});

	test("open: the scores (files marked as notation) first, then the other attachments", () => {
		setup({ open: true });
		expect(h.scoresProps).toMatchObject({ songId: "s1", pdfs: [{ id: "scan" }] });
		expect(h.filesProps).toMatchObject({ scoresApart: true });
		expect(screen.getByText("Other attachments")).toBeInTheDocument();
	});

	test("Upload attachments opens the picker for an editor", async () => {
		setup({ open: true });
		await fireEvent.click(screen.getByLabelText("Upload attachments"));
		expect(h.pick).toHaveBeenCalledTimes(1);
	});

	test("a visitor has no upload button", () => {
		setup({ open: true, canEdit: false });
		expect(screen.queryByLabelText("Upload attachments")).toBeNull();
	});

	test("pick() and pickNotation() open the panel, then their picker", async () => {
		const { component, container } = setup();
		await component.pick();
		await tick();
		expect(wrapper(container)).not.toContain("hidden");
		expect(h.pick).toHaveBeenCalledTimes(1);
		await component.pickNotation();
		expect(h.pickNotation).toHaveBeenCalledTimes(1);
	});

	test("reviewRead(fileId), the song check's deep link, opens that file's read here", async () => {
		const { component, container } = setup();
		await component.reviewRead("scan");
		expect(wrapper(container)).not.toContain("hidden");
		expect(h.showRead).toHaveBeenCalledWith("scan");
	});

	test("Import from a score: the scores to pick from; with none, the notation upload", async () => {
		const one = setup();
		await one.component.importScore();
		expect(h.pickNotation).not.toHaveBeenCalled();
		one.unmount();
		const none = setup({ files: [pdf("photo", false)] });
		await none.component.importScore();
		expect(h.pickNotation).toHaveBeenCalledTimes(1);
	});

	test("Read again: a score by its kind and id, a MIDI file through its own chart", async () => {
		const { component } = setup({ files: [pdf("scan", true), pdf("song", false, "midi")] });
		const at = "2026-11-10T12:00:00.000Z";
		await component.readAgain({ kind: "file", id: "scan", at });
		expect(h.useAsChart).toHaveBeenCalledWith("file", "scan");
		await component.readAgain({ kind: "file", id: "song", at });
		expect(h.chartMidi).toHaveBeenCalledWith(
			expect.objectContaining({ id: "song" }),
			expect.any(Function),
		);
		await component.readAgain({ kind: "stems", at });
		expect(h.useAsChart).toHaveBeenCalledTimes(1);
	});

	test("a MIDI file's chart names the attachment as its source", () => {
		const { onchart } = setup({ open: true });
		(h.filesProps!.onchart as (s: unknown) => void)({
			chart: "| C |",
			notationId: "m1",
			source: "Song",
		});
		expect(onchart).toHaveBeenCalledWith(expect.objectContaining({ id: "m1", kind: "file" }));
	});
});
