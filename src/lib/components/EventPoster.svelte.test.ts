import { installFakePopover } from "../../../tests/helpers/fakePopover";
import { render, screen } from "@testing-library/svelte";
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

beforeAll(installFakePopover);

const { default: EventPoster } = await import("./EventPoster.svelte");

const poster = {
	id: "file-1",
	kind: "poster" as const,
	status: "ready" as const,
	url: "https://blob.example/poster.pdf",
	filename: "poster.pdf",
	contentType: "application/pdf",
	sizeBytes: 1000,
	width: null,
	height: null,
	caption: "",
	sortOrder: 0,
	thumbnailUrl: "https://blob.example/poster-thumb.webp",
	shareCode: "abc123",
	createdAt: new Date(),
};
const base = { eventId: "event-1", noun: "show" as const, title: "Friday at the Pub" };

describe("EventPoster", () => {
	beforeEach(() => {
		vi.resetAllMocks();
	});

	test("a poster shows its thumbnail and one menu with the permanent links", async () => {
		const user = userEvent.setup();
		render(EventPoster, { props: { ...base, poster, canEdit: false, onchange: vi.fn() } });
		const img = screen.getByRole("img", { name: "Poster for Friday at the Pub" });
		expect(img).toHaveAttribute("src", poster.thumbnailUrl);
		await user.click(screen.getByRole("button", { name: "Poster actions" }));
		const open = screen.getByRole("link", { name: "Open" });
		expect(open).toHaveAttribute("href", "/f/abc123");
		expect(open).toHaveAttribute("target", "_blank");
		expect(screen.getByRole("link", { name: "Download" })).toHaveAttribute(
			"href",
			"/f/abc123?download=1",
		);
		expect(screen.getByRole("button", { name: "Copy link" })).toBeInTheDocument();
	});

	test("a viewer's menu has no Replace or Remove, and no file input", async () => {
		const user = userEvent.setup();
		render(EventPoster, { props: { ...base, poster, canEdit: false, onchange: vi.fn() } });
		await user.click(screen.getByRole("button", { name: "Poster actions" }));
		expect(screen.queryByRole("button", { name: "Replace" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
		expect(screen.queryByLabelText("Replace the poster")).toBeNull();
	});

	test("Copy link writes the permanent link and says so", async () => {
		const user = userEvent.setup();
		const writeText = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
		render(EventPoster, { props: { ...base, poster, canEdit: false, onchange: vi.fn() } });
		await user.click(screen.getByRole("button", { name: "Poster actions" }));
		await user.click(screen.getByRole("button", { name: "Copy link" }));
		await vi.waitFor(() => expect(h.notify).toHaveBeenCalledWith("Link copied"));
		expect(writeText).toHaveBeenCalledWith(`${location.origin}/f/abc123`);
	});

	test("Replace opens the hidden file input, which uploads the new poster", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		h.uploadEventFile.mockResolvedValue(poster);
		render(EventPoster, { props: { ...base, poster, canEdit: true, onchange } });
		const input = screen.getByLabelText<HTMLInputElement>("Replace the poster");
		expect(input).toHaveAttribute("accept", "application/pdf,image/*");
		const click = vi.spyOn(input, "click");
		await user.click(screen.getByRole("button", { name: "Poster actions" }));
		await user.click(screen.getByRole("button", { name: "Replace" }));
		expect(click).toHaveBeenCalled();
		const file = new File(["%PDF"], "poster.pdf", { type: "application/pdf" });
		await user.upload(input, file);
		await vi.waitFor(() => expect(onchange).toHaveBeenCalledWith(poster));
		expect(h.uploadEventFile).toHaveBeenCalledWith("event-1", "poster", file);
	});

	test("a PDF without a thumbnail shows a placeholder named the same", () => {
		render(EventPoster, {
			props: {
				...base,
				poster: { ...poster, thumbnailUrl: null },
				canEdit: false,
				onchange: vi.fn(),
			},
		});
		const placeholder = screen.getByRole("img", { name: "Poster for Friday at the Pub" });
		expect(placeholder.tagName).toBe("SPAN");
	});

	test("without one, a viewer reads No poster yet and an editor gets the upload control", () => {
		const { unmount } = render(EventPoster, {
			props: { ...base, poster: null, canEdit: false, onchange: vi.fn() },
		});
		expect(screen.getByText("No poster yet.")).toBeInTheDocument();
		unmount();
		render(EventPoster, { props: { ...base, poster: null, canEdit: true, onchange: vi.fn() } });
		expect(screen.getByLabelText("Upload a poster")).toHaveAttribute(
			"accept",
			"application/pdf,image/*",
		);
		expect(screen.getByText(/it is the show's picture\./)).toBeInTheDocument();
	});

	test("picking a file uploads it as the poster and hands the row up", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		h.uploadEventFile.mockResolvedValue(poster);
		render(EventPoster, { props: { ...base, poster: null, canEdit: true, onchange } });
		const file = new File(["%PDF"], "poster.pdf", { type: "application/pdf" });
		await user.upload(screen.getByLabelText<HTMLInputElement>("Upload a poster"), file);
		await vi.waitFor(() => expect(onchange).toHaveBeenCalledWith(poster));
		expect(h.uploadEventFile).toHaveBeenCalledWith("event-1", "poster", file);
		expect(h.notify).toHaveBeenCalledWith("Poster uploaded");
	});

	test("Remove asks, deletes, and clears the poster", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		vi.stubGlobal(
			"confirm",
			vi.fn(() => true),
		);
		h.deleteEventFile.mockResolvedValue({ ok: true });
		render(EventPoster, { props: { ...base, poster, canEdit: true, onchange } });
		await user.click(screen.getByRole("button", { name: "Poster actions" }));
		await user.click(screen.getByRole("button", { name: "Remove" }));
		expect(confirm).toHaveBeenCalledWith("Remove the poster?");
		expect(h.deleteEventFile).toHaveBeenCalledWith({ id: "file-1" });
		await vi.waitFor(() => expect(onchange).toHaveBeenCalledWith(null));
		expect(h.notify).toHaveBeenCalledWith("Poster removed");
		vi.unstubAllGlobals();
	});

	test("Remove declined does nothing", async () => {
		const user = userEvent.setup();
		const onchange = vi.fn();
		vi.stubGlobal(
			"confirm",
			vi.fn(() => false),
		);
		render(EventPoster, { props: { ...base, poster, canEdit: true, onchange } });
		await user.click(screen.getByRole("button", { name: "Poster actions" }));
		await user.click(screen.getByRole("button", { name: "Remove" }));
		expect(h.deleteEventFile).not.toHaveBeenCalled();
		expect(onchange).not.toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});
