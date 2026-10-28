import { render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";

const h = vi.hoisted(() => ({
	deleteEventFile: vi.fn(),
	updateEventFileCaption: vi.fn(),
	notify: vi.fn(),
	uploadEventFile: vi.fn(),
}));
vi.mock("#lib/remote/events.remote.js", () => ({
	deleteEventFile: h.deleteEventFile,
	updateEventFileCaption: h.updateEventFileCaption,
}));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: h.notify }));
vi.mock("#lib/upload.js", () => ({ uploadEventFile: h.uploadEventFile }));

const { default: EventPhotos } = await import("./EventPhotos.svelte");

const photo = (n: number, caption = "") => ({
	id: `photo-${n}`,
	kind: "photo" as const,
	status: "ready" as const,
	url: `https://blob.example/${n}.jpg`,
	filename: `${n}.jpg`,
	contentType: "image/jpeg",
	sizeBytes: 1000,
	width: 1600,
	height: 1200,
	caption,
	sortOrder: n,
	thumbnailUrl: `https://blob.example/${n}-thumb.webp`,
	shareCode: `code${n}`,
	createdAt: new Date(),
});
const photos = [photo(1, "Soundcheck"), photo(2), photo(3, "Encore")];
const base = { eventId: "event-1", noun: "show" as const };

/** jsdom's <dialog> may lack the modal API: open and close it by the attribute, firing close. */
beforeAll(() => {
	HTMLDialogElement.prototype.showModal = function (this: HTMLDialogElement) {
		this.setAttribute("open", "");
	};
	HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
		this.removeAttribute("open");
		this.dispatchEvent(new Event("close"));
	};
});

describe("EventPhotos", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	test("empty: No photos yet, and Add photos for an editor only", () => {
		const { unmount } = render(EventPhotos, {
			props: { ...base, photos: [], canEdit: false, onchange: vi.fn() },
		});
		expect(screen.getByText("No photos yet.")).toBeInTheDocument();
		expect(screen.queryByText("Add photos")).toBeNull();
		unmount();
		render(EventPhotos, { props: { ...base, photos: [], canEdit: true, onchange: vi.fn() } });
		expect(screen.getByLabelText("Add photos")).toHaveAttribute("multiple");
	});

	test("the grid shows a thumbnail each, and one opens the lightbox on the full image; Next and the arrow keys move", async () => {
		const user = userEvent.setup();
		render(EventPhotos, { props: { ...base, photos, canEdit: false, onchange: vi.fn() } });
		const grid = screen.getByRole("list", { name: "Photos" });
		expect(within(grid).getAllByRole("listitem")).toHaveLength(3);
		await user.click(screen.getByRole("button", { name: "Open photo 1" }));
		const dialog = document.querySelector("dialog")!;
		expect(dialog).toHaveAttribute("open");
		expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://blob.example/1.jpg");
		expect(within(dialog).getByText("Soundcheck")).toBeInTheDocument();
		expect(within(dialog).getByRole("link", { name: "Download" })).toHaveAttribute(
			"href",
			"/f/code1?download=1",
		);
		expect(within(dialog).queryByLabelText("Caption")).toBeNull();
		await user.click(within(dialog).getByRole("button", { name: "Next" }));
		expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://blob.example/2.jpg");
		await user.keyboard("{ArrowRight}");
		expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://blob.example/3.jpg");
		await user.keyboard("{ArrowRight}");
		expect(within(dialog).getByRole("img")).toHaveAttribute("src", "https://blob.example/1.jpg");
		await user.click(within(dialog).getByRole("button", { name: "Close" }));
		expect(dialog).not.toHaveAttribute("open");
	});

	test("an editor's caption is saved on change", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		h.updateEventFileCaption.mockResolvedValue({ ok: true });
		render(EventPhotos, { props: { ...base, photos, canEdit: true, onchange } });
		await user.click(screen.getByRole("button", { name: "Open photo 2" }));
		const caption = screen.getByLabelText("Caption");
		await user.type(caption, "The crowd");
		caption.blur();
		await vi.waitFor(() =>
			expect(h.updateEventFileCaption).toHaveBeenCalledWith({
				id: "photo-2",
				caption: "The crowd",
			}),
		);
		expect(onchange.mock.calls[0][0][1].caption).toBe("The crowd");
		expect(h.notify).toHaveBeenCalledWith("Caption saved");
	});

	test("Delete asks, deletes and hands up the list without it", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);
		h.deleteEventFile.mockResolvedValue({ ok: true });
		render(EventPhotos, { props: { ...base, photos, canEdit: true, onchange } });
		await user.click(screen.getByRole("button", { name: "Open photo 3" }));
		await user.click(screen.getByRole("button", { name: "Delete" }));
		expect(confirm).toHaveBeenCalledWith("Delete this photo?");
		expect(h.deleteEventFile).toHaveBeenCalledWith({ id: "photo-3" });
		await vi.waitFor(() => expect(onchange).toHaveBeenCalledWith([photos[0], photos[1]]));
		expect(h.notify).toHaveBeenCalledWith("Photo deleted");
		vi.unstubAllGlobals();
	});

	test("Add photos uploads each in turn, appending as they finish; a failure notifies and the rest go on", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		h.uploadEventFile
			.mockResolvedValueOnce(photo(4))
			.mockRejectedValueOnce(new Error("Not an image."))
			.mockResolvedValueOnce(photo(6));
		render(EventPhotos, { props: { ...base, photos: [], canEdit: true, onchange } });
		const files = [4, 5, 6].map((n) => new File(["x"], `${n}.jpg`, { type: "image/jpeg" }));
		await user.upload(screen.getByLabelText<HTMLInputElement>("Add photos"), files);
		await vi.waitFor(() => expect(h.uploadEventFile).toHaveBeenCalledTimes(3));
		await vi.waitFor(() => expect(onchange).toHaveBeenCalledTimes(2));
		expect(h.uploadEventFile).toHaveBeenNthCalledWith(1, "event-1", "photo", files[0]);
		expect(onchange).toHaveBeenLastCalledWith(
			[photo(4), photo(6)].map((p) => expect.objectContaining({ id: p.id })),
		);
		expect(h.notify).toHaveBeenCalledWith("5.jpg: Not an image.", { kind: "error" });
	});
});
