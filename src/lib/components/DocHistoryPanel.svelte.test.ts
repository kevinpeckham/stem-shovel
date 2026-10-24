import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { describe, expect, test, vi } from "vite-plus/test";

const versions = [
	{
		id: "v2",
		versionNumber: 2,
		markdown: "Verse\nold line\nChorus\n",
		html: "<p>Version two</p>",
		createdAt: Date.UTC(2026, 9, 20),
		createdBy: { name: "Dawn" },
	},
	{
		id: "v1",
		versionNumber: 1,
		markdown: "Verse\nnew line\nChorus",
		html: "<p>Version one</p>",
		createdAt: Date.UTC(2026, 9, 19),
		createdBy: null,
	},
];

vi.mock("#lib/remote/history.remote.js", () => ({
	docHistory: vi.fn(async () => ({ versions })),
	commentHistory: vi.fn(async () => ({ versions: [] })),
	restoreDocVersion: vi.fn(),
	restoreCommentVersion: vi.fn(),
}));

const { default: DocHistoryPanel } = await import("./DocHistoryPanel.svelte");

const target = {
	kind: "doc" as const,
	songId: "V1StGXR8_Z5jdHi6B-myT",
	doc: "chart" as const,
	label: "the chart",
	current: "Verse\nnew line\nChorus\n",
};

describe("DocHistoryPanel", () => {
	test("Changes shows what changed since a version, View its rendered text", async () => {
		render(DocHistoryPanel, { props: { target, canRestore: false, onclose: () => {} } });
		const changes = await screen.findAllByRole("button", { name: "Changes" });
		await fireEvent.click(changes[0]);
		expect(changes[0]).toHaveAttribute("aria-pressed", "true");
		const diff = within(screen.getByLabelText("Changes since version 2"));
		expect(diff.getByText("− old line")).toHaveClass("text-red-200");
		expect(diff.getByText("+ new line")).toHaveClass("text-emerald-200");

		await fireEvent.click(screen.getAllByRole("button", { name: "View" })[0]);
		expect(screen.getByText("Version two")).toBeInTheDocument();
		expect(screen.queryByLabelText("Changes since version 2")).toBeNull();
		expect(changes[0]).toHaveAttribute("aria-pressed", "false");
	});
	test("a version equal to the current text says so", async () => {
		render(DocHistoryPanel, { props: { target, canRestore: false, onclose: () => {} } });
		const changes = await screen.findAllByRole("button", { name: "Changes" });
		await fireEvent.click(changes[1]);
		expect(screen.getByText("Same as the current text")).toBeInTheDocument();
	});
	test("without the current text there is no Changes button", async () => {
		render(DocHistoryPanel, {
			props: { target: { ...target, current: undefined }, canRestore: false, onclose: () => {} },
		});
		await screen.findAllByRole("button", { name: "View" });
		expect(screen.queryByRole("button", { name: "Changes" })).toBeNull();
	});
});
