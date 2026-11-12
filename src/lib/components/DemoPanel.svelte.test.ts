import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { createRawSnippet } from "svelte";

/**
 * The Demos view's row menu: the demo's own page for everyone, Share… there
 * and Remove for an editor, the downloads (the MP3 when there is one, then
 * the original).
 */
const h = vi.hoisted(() => ({ saveAs: vi.fn() }));
vi.mock("#lib/upload.js", () => ({ saveAs: h.saveAs }));

const { default: DemoPanel } = await import("./DemoPanel.svelte");

const demo = (id: string, over: Record<string, unknown> = {}) => ({
	id,
	label: `Take ${id}`,
	url: `https://b/${id}.m4a`,
	playbackUrl: `https://b/${id}.mp3`,
	filename: `${id}.m4a`,
	sizeBytes: 1000,
	...over,
});
const hrefOf = (id: string) => `/acct/projects/lp/song/demos/${id}`;

function menuOf(label: string) {
	const row = screen.getByText(label).closest("li")!;
	return within(row).getByRole("menu", { hidden: true });
}

describe("DemoPanel row menu", () => {
	beforeEach(() => vi.clearAllMocks());

	test("everyone gets the demo's page and both downloads; no Share… or Remove", async () => {
		render(DemoPanel, { demos: [demo("d1")], hrefOf });
		const menu = menuOf("Take d1");
		const items = within(menu).getAllByRole("menuitem", { hidden: true });
		expect(items.map((i) => i.textContent?.trim())).toEqual([
			"Open page",
			"Download MP3",
			"Download original",
		]);
		expect(items[0].getAttribute("href")).toBe("/acct/projects/lp/song/demos/d1");
		await fireEvent.click(items[1]);
		expect(h.saveAs).toHaveBeenCalledWith("https://b/d1.mp3", "Take d1.mp3");
		await fireEvent.click(items[2]);
		expect(h.saveAs).toHaveBeenLastCalledWith("https://b/d1.m4a", "d1.m4a");
	});

	test("an editor also gets Share… on the demo's page, Add notes… and Remove", async () => {
		const onremove = vi.fn();
		const oneditnotes = vi.fn();
		render(DemoPanel, {
			demos: [demo("d1", { playbackUrl: null })],
			hrefOf,
			canEdit: true,
			onremove,
			oneditnotes,
		});
		const items = within(menuOf("Take d1")).getAllByRole("menuitem", { hidden: true });
		expect(items.map((i) => i.textContent?.trim())).toEqual([
			"Open page",
			"Share…",
			"Download file",
			"Add notes…",
			"Remove demo",
		]);
		expect(items[1].getAttribute("href")).toBe("/acct/projects/lp/song/demos/d1?open=share");
		await fireEvent.click(items[3]);
		expect(oneditnotes).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
		await fireEvent.click(items[4]);
		expect(onremove).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
	});

	test("a press outside an open row menu closes it; a press inside keeps it open", async () => {
		render(DemoPanel, { demos: [demo("d1"), demo("d2")] });
		const menu = screen.getByText("Take d1").closest("li")!.querySelector("details")!;
		menu.open = true;
		await fireEvent.pointerDown(within(menu).getByRole("menu", { hidden: true }));
		expect(menu.open).toBe(true);
		await fireEvent.pointerDown(screen.getByText("Take d2"));
		expect(menu.open).toBe(false);
	});

	test("without a page to link to, the menu holds only the downloads", () => {
		render(DemoPanel, { demos: [demo("d1")] });
		const items = within(menuOf("Take d1")).getAllByRole("menuitem", { hidden: true });
		expect(items.map((i) => i.textContent?.trim())).toEqual(["Download MP3", "Download original"]);
	});
});

/**
 * The tiles' comments: a tile that is not open shows how many comments its
 * demo has and, for the signed-in person, a bubble with the new ones; the
 * open demo's tile shows neither (its comments are above the list). Opening
 * a demo with new comments tells the page once.
 */
describe("DemoPanel comment counts", () => {
	const comment = (id: string, demoId: string) => ({ id, demoId, title: id, body: "", at: null });
	const tileOf = (label: string) =>
		within(screen.getByRole("list", { name: "Demos" }))
			.getByText(label)
			.closest("li")!;
	const comments = [comment("c1", "d1"), comment("c2", "d1"), comment("c3", "d2")];

	beforeEach(() => vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue());

	test("a tile counts its demo's comments, singular and plural; none without comments", () => {
		render(DemoPanel, {
			demos: [demo("d1"), demo("d2"), demo("d3")],
			comments: comments as never,
		});
		expect(tileOf("Take d1").textContent).toContain("2 comments");
		expect(tileOf("Take d2").textContent).toContain("1 comment");
		expect(tileOf("Take d2").textContent).not.toContain("1 comments");
		expect(tileOf("Take d3").textContent).not.toContain("comment");
	});

	test("new comments show in a bubble with an accessible name; none at zero", () => {
		render(DemoPanel, {
			demos: [demo("d1"), demo("d2"), demo("d3")],
			comments: comments as never,
			newComments: { d1: 2, d2: 1, d3: 0 },
		});
		const two = within(tileOf("Take d1")).getByLabelText("2 new comments");
		expect(two.textContent).toBe("2");
		expect(two.getAttribute("title")).toBe("2 new comments");
		expect(within(tileOf("Take d2")).getByLabelText("1 new comment").textContent).toBe("1");
		expect(within(tileOf("Take d3")).queryByLabelText(/new comment/)).toBeNull();
	});

	test("the open demo's tile shows neither; onseen fires once for a demo with new comments, not for one without", async () => {
		const onseen = vi.fn();
		render(DemoPanel, {
			demos: [demo("d1"), demo("d2")],
			comments: comments as never,
			newComments: { d1: 2 },
			onseen,
		});
		await fireEvent.click(screen.getByRole("button", { name: "Play Take d2" }));
		expect(onseen).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole("button", { name: "Play Take d1" }));
		expect(onseen).toHaveBeenCalledTimes(1);
		expect(onseen).toHaveBeenCalledWith({ id: "d1" });
		const open = tileOf("Take d1");
		expect(open.textContent).not.toContain("comment");
		expect(within(open).queryByLabelText(/new comment/)).toBeNull();
		// Pausing and playing the same demo again is not opening it again.
		await fireEvent.click(screen.getByRole("button", { name: "Pause Take d1" }));
		await fireEvent.click(screen.getByRole("button", { name: "Play Take d1" }));
		expect(onseen).toHaveBeenCalledTimes(1);
		// The other tile, no longer open, counts its comments again.
		expect(tileOf("Take d2").textContent).toContain("1 comment");
	});

	test("show() (a ?demo= link) opens the demo and reports it seen", async () => {
		const onseen = vi.fn();
		const { component } = render(DemoPanel, {
			demos: [demo("d1")],
			newComments: { d1: 3 },
			onseen,
		});
		(component as unknown as { show: (id: string) => void }).show("d1");
		expect(onseen).toHaveBeenCalledWith({ id: "d1" });
	});
});

/**
 * The notes typed at upload: the open demo shows them above its comments
 * as plain text; a tile that is not open and carries notes shows an icon
 * named "Has notes", and none when its notes are empty.
 */
describe("DemoPanel notes", () => {
	const card = createRawSnippet(() => ({ render: () => "<span></span>" }));
	const tileOf = (label: string) =>
		within(screen.getByRole("list", { name: "Demos" }))
			.getByText(label)
			.closest("li")!;

	beforeEach(() => vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue());

	test("the open demo's notes show as text with their line breaks; its tile drops the icon", async () => {
		const notes = "The bridge idea\n<b>listen</b> at 1:20";
		render(DemoPanel, { demos: [demo("d1", { notes }), demo("d2", { notes: "" })], card });
		expect(within(tileOf("Take d1")).getByRole("img", { name: "Has notes" })).toBeTruthy();
		expect(within(tileOf("Take d2")).queryByRole("img", { name: "Has notes" })).toBeNull();
		expect(screen.queryByRole("region", { name: "Notes" })).toBeNull();
		await fireEvent.click(screen.getByRole("button", { name: "Play Take d1" }));
		const block = screen.getByRole("region", { name: "Notes" });
		const text = block.querySelector("p")!;
		expect(text.textContent).toBe(notes);
		expect(text.className).toContain("whitespace-pre-wrap");
		expect(block.querySelector("b")).toBeNull();
		expect(within(tileOf("Take d1")).queryByRole("img", { name: "Has notes" })).toBeNull();
	});

	test("an open demo without notes shows no Notes block", async () => {
		render(DemoPanel, { demos: [demo("d1", { notes: "  " })], card });
		await fireEvent.click(screen.getByRole("button", { name: "Play Take d1" }));
		expect(document.querySelector("[data-recording-review]")).not.toBeNull();
		expect(screen.queryByRole("region", { name: "Notes" })).toBeNull();
	});
});
