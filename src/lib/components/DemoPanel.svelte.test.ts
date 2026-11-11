import { fireEvent, render, screen, within } from "@testing-library/svelte";
import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

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

	test("an editor also gets Share… on the demo's page and Remove", async () => {
		const onremove = vi.fn();
		render(DemoPanel, {
			demos: [demo("d1", { playbackUrl: null })],
			hrefOf,
			canEdit: true,
			onremove,
		});
		const items = within(menuOf("Take d1")).getAllByRole("menuitem", { hidden: true });
		expect(items.map((i) => i.textContent?.trim())).toEqual([
			"Open page",
			"Share…",
			"Download file",
			"Remove demo",
		]);
		expect(items[1].getAttribute("href")).toBe("/acct/projects/lp/song/demos/d1?open=share");
		await fireEvent.click(items[3]);
		expect(onremove).toHaveBeenCalledWith(expect.objectContaining({ id: "d1" }));
	});

	test("without a page to link to, the menu holds only the downloads", () => {
		render(DemoPanel, { demos: [demo("d1")] });
		const items = within(menuOf("Take d1")).getAllByRole("menuitem", { hidden: true });
		expect(items.map((i) => i.textContent?.trim())).toEqual(["Download MP3", "Download original"]);
	});
});
