import { fireEvent, render, screen } from "@testing-library/svelte";
import { tick } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";

/**
 * The Attachments panel on the song page: hidden until opened, the upload
 * button for an editor, and `pick()` (the Uploads menu) opening the panel
 * before the picker. The files panel is a stand-in exposing `pick`.
 */
const h = vi.hoisted(() => ({ pick: vi.fn() }));
vi.mock("#lib/components/SongFilesPanel.svelte", () => ({ default: () => ({ pick: h.pick }) }));

const { default: SongAttachmentsPanel } = await import("./SongAttachmentsPanel.svelte");

function setup({ open = false, canEdit = true } = {}) {
	h.pick.mockClear();
	return render(SongAttachmentsPanel, {
		open,
		songId: "s1",
		songTitle: "Letter Lands",
		files: [],
		scores: [],
		canEdit,
		onnotation: async () => {},
	});
}

describe("SongAttachmentsPanel", () => {
	test("closed, the wrapper is hidden", () => {
		const { container } = setup();
		expect((container.firstElementChild as HTMLElement).className).toContain("hidden");
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

	test("pick() opens the panel, then the picker", async () => {
		const { component, container } = setup();
		await component.pick();
		await tick();
		expect((container.firstElementChild as HTMLElement).className).not.toContain("hidden");
		expect(h.pick).toHaveBeenCalledTimes(1);
	});
});
