import { fireEvent, render, screen, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { beforeAll, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { fakeRemoteForm } from "../../../tests/helpers/fakeRemoteForm";

/**
 * The Mixes view (docs/mixes.md): the newest mix chosen with its version,
 * uploader and notes, the list of every mix, the mix's own comments (and
 * no other mix's), what editors and commenters may do, and the callbacks
 * the page wires: comment, rename, remove, share, the notes, the files.
 */
const deleteComment = fakeRemoteForm();
vi.mock("#lib/remote/comments.remote.js", () => ({ deleteComment }));
vi.mock("#lib/state/notifications.svelte.js", () => ({ notify: vi.fn() }));
vi.mock("#lib/upload.js", () => ({ saveAs: vi.fn() }));

const { default: MixPanel } = await import("./MixPanel.svelte");

const T0 = new Date(2026, 9, 9, 12, 0, 0);
const peaks = Array.from({ length: 1024 }, () => 0.5);
const mix = (id: string, version: number, over: Record<string, unknown> = {}) => ({
	id,
	version,
	label: `Mix ${version}`,
	notes: "",
	notesHtml: "",
	status: "ready",
	url: `https://b/${id}.wav`,
	playbackUrl: null,
	filename: `mix-${version}.wav`,
	sizeBytes: 1_000_000,
	durationSeconds: 120,
	peaks,
	createdAt: T0,
	uploader: { name: "Sam" },
	...over,
});
const comment = (id: string, mixId: string, title: string, at: number | null) => ({
	id,
	mixId,
	userId: "me",
	authorName: "Pat",
	title,
	body: "text",
	at,
	createdAt: T0,
	editedAt: null,
});
const base = (over: Record<string, unknown> = {}) => ({
	mixes: [mix("m1", 1), mix("m2", 2, { notes: "Vocal up", notesHtml: "<p>Vocal up</p>" })],
	comments: [comment("c1", "m2", "Bass late", 30), comment("c2", "m1", "Old note", null)],
	canEdit: true,
	canComment: true,
	me: { id: "me" },
	card: (() => {}) as never,
	...over,
});

beforeAll(() => {
	// jsdom has no popover API; the menu calls these when an item is chosen.
	for (const m of ["showPopover", "hidePopover", "togglePopover"])
		if (!(m in HTMLElement.prototype)) Object.assign(HTMLElement.prototype, { [m]() {} });
});
beforeEach(() => vi.clearAllMocks());

describe("MixPanel", () => {
	test("opens on the newest mix with its version, uploader and notes, and lists every mix", () => {
		render(MixPanel, { props: base() });
		expect(screen.getAllByText("v2").length).toBeGreaterThan(0);
		expect(screen.getAllByText("Mix 2").length).toBeGreaterThan(0);
		expect(screen.getAllByText(/Sam/).length).toBeGreaterThan(0);
		expect(screen.getByText("Vocal up")).toBeInTheDocument();
		const all = screen.getByRole("region", { name: "All mixes" });
		expect(within(all).getAllByRole("button")).toHaveLength(2);
		expect(within(all).getByRole("button", { pressed: true })).toHaveTextContent("Mix 2");
	});
	test("shows the chosen mix's comments only, with a position that seeks", async () => {
		render(MixPanel, { props: base() });
		const list = screen.getByRole("region", { name: "Comments on this mix" });
		expect(within(list).getByText("Bass late")).toBeInTheDocument();
		expect(within(list).queryByText("Old note")).toBeNull();
		expect(within(list).getByRole("button", { name: /0:30/ })).toBeInTheDocument();
		// Choosing the older mix swaps the list.
		await fireEvent.click(screen.getByRole("button", { name: /Mix 1/ }));
		expect(within(list).queryByText("Bass late")).toBeNull();
		expect(screen.getByText("Old note")).toBeInTheDocument();
	});
	test("Comment asks the page for a comment on the mix; download offers the file (and the MP3 only when the file is not one); the name is renamed in place", async () => {
		const oncomment = vi.fn();
		const onrename = vi.fn();
		const onshare = vi.fn();
		const user = userEvent.setup();
		render(MixPanel, { props: base({ oncomment, onrename, onshare }) });
		await user.click(screen.getByRole("button", { name: "Comment on this mix" }));
		expect(oncomment).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }), null);
		await user.click(screen.getByRole("button", { name: "Download" }));
		expect(screen.getByText(/Download \.wav/)).toBeInTheDocument();
		// No MP3 rendition yet (playbackUrl null): no second item.
		expect(screen.queryByText("Download .mp3")).toBeNull();
		await user.click(screen.getByRole("button", { name: "Share mix" }));
		expect(onshare).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }));
		// Rename in place: the pencil opens a box with the name; Enter saves; Escape would drop it.
		await user.click(screen.getByRole("button", { name: "Rename Mix" }));
		const box = screen.getByRole("textbox", { name: "Mix name" });
		expect(box).toHaveValue("Mix 2");
		await fireEvent.input(box, { target: { value: "Final" } });
		await fireEvent.keyDown(box, { key: "Enter" });
		expect(onrename).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }), "Final");
	});
	test("the notes are edited in place and saved through the page", async () => {
		const onnotes = vi.fn(async () => {});
		render(MixPanel, { props: base({ onnotes }) });
		await fireEvent.click(screen.getByRole("button", { name: "Add or Edit Notes" }));
		const box = screen.getByRole("textbox", { name: "Notes on this mix" });
		expect(box).toHaveValue("Vocal up");
		await fireEvent.input(box, { target: { value: "Vocal up 1 dB" } });
		await fireEvent.click(screen.getByRole("button", { name: /Save/ }));
		expect(onnotes).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }), "Vocal up 1 dB");
	});
	test("a listener who may not edit sees no upload, menu actions or notes editing; one who may not comment sees no Comment", () => {
		render(MixPanel, { props: base({ canEdit: false, canComment: false, me: null }) });
		expect(screen.queryByRole("button", { name: /Upload/ })).toBeNull();
		expect(screen.queryByRole("button", { name: "Add or Edit Notes" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Share mix" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Comment on this mix" })).toBeNull();
		expect(screen.getByText("Vocal up")).toBeInTheDocument();
	});
	test("no mixes: an editor is invited to upload the first", () => {
		render(MixPanel, { props: base({ mixes: [], comments: [] }) });
		expect(screen.getByText(/Upload the first bounce/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Upload New Mix" })).toBeInTheDocument();
	});
});
