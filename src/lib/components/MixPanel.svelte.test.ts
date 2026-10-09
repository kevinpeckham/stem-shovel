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
	showPos: (s: number) => `${s}s`,
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
		expect(within(list).getByRole("button", { name: /30s/ })).toBeInTheDocument();
		// Choosing the older mix swaps the list.
		await fireEvent.click(screen.getByRole("button", { name: /Mix 1/ }));
		expect(within(list).queryByText("Bass late")).toBeNull();
		expect(screen.getByText("Old note")).toBeInTheDocument();
	});
	test("Comment asks the page for a comment on the mix; the menu offers download, share, rename and remove to an editor", async () => {
		const oncomment = vi.fn();
		const onrename = vi.fn();
		const user = userEvent.setup();
		render(MixPanel, { props: base({ oncomment, onrename }) });
		await user.click(screen.getByRole("button", { name: "Comment on this mix" }));
		expect(oncomment).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }), null);
		await user.click(screen.getByRole("button", { name: "Mix 2 actions" }));
		// The menu's items (the popover is in the DOM, open or not; jsdom knows no popover styling).
		expect(screen.getByText(/Download WAV/)).toBeInTheDocument();
		expect(screen.getByText("Share by email")).toBeInTheDocument();
		await user.click(screen.getByText("Rename"));
		expect(onrename).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }));
	});
	test("the notes are edited in place and saved through the page", async () => {
		const onnotes = vi.fn(async () => {});
		render(MixPanel, { props: base({ onnotes }) });
		await fireEvent.click(screen.getByRole("button", { name: "Edit notes" }));
		const box = screen.getByRole("textbox", { name: "Notes on this mix" });
		expect(box).toHaveValue("Vocal up");
		await fireEvent.input(box, { target: { value: "Vocal up 1 dB" } });
		await fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
		expect(onnotes).toHaveBeenCalledWith(expect.objectContaining({ id: "m2" }), "Vocal up 1 dB");
	});
	test("a listener who may not edit sees no upload, menu actions or notes editing; one who may not comment sees no Comment", () => {
		render(MixPanel, { props: base({ canEdit: false, canComment: false, me: null }) });
		expect(screen.queryByRole("button", { name: "Upload Mix" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Edit notes" })).toBeNull();
		expect(screen.queryByRole("button", { name: "Comment on this mix" })).toBeNull();
		expect(screen.getByText("Vocal up")).toBeInTheDocument();
	});
	test("no mixes: an editor is invited to upload the first", () => {
		render(MixPanel, { props: base({ mixes: [], comments: [] }) });
		expect(screen.getByText(/Upload the first bounce/)).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Upload Mix" })).toBeInTheDocument();
	});
});
