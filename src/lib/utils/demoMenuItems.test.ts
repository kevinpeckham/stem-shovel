import { describe, expect, test, vi } from "vite-plus/test";
import { demoMenuItems } from "./demoMenuItems";

const d = {
	id: "d1",
	label: "Take one",
	url: "https://b/d1.m4a",
	filename: "d1.m4a",
	playbackUrl: "https://b/d1.mp3" as string | null,
};
const hrefOf = (id: string) => `/a/projects/p/s/demos/${id}`;

describe("demoMenuItems", () => {
	test("everyone: the page, the MP3 and the original", () => {
		const save = vi.fn();
		const items = demoMenuItems(d, { hrefOf, canEdit: false, save });
		expect(items.map((i) => [i.label, i.href])).toEqual([
			["Open page", "/a/projects/p/s/demos/d1"],
			["Download MP3", undefined],
			["Download original", undefined],
		]);
		items[1].action?.();
		expect(save).toHaveBeenCalledWith("https://b/d1.mp3", "Take one.mp3");
		items[2].action?.();
		expect(save).toHaveBeenLastCalledWith("https://b/d1.m4a", "d1.m4a");
	});
	test("an editor: Share… on the page and Remove; no MP3 yet means the file", () => {
		const remove = vi.fn();
		const items = demoMenuItems(
			{ ...d, playbackUrl: null },
			{ hrefOf, canEdit: true, save: vi.fn(), remove },
		);
		expect(items.map((i) => [i.label, i.href])).toEqual([
			["Open page", "/a/projects/p/s/demos/d1"],
			["Share…", "/a/projects/p/s/demos/d1?open=share"],
			["Download file", undefined],
			["Remove demo", undefined],
		]);
		items[3].action?.();
		expect(remove).toHaveBeenCalled();
	});
	test("no page to link to, no remover: the downloads alone", () => {
		expect(demoMenuItems(d, { canEdit: true, save: vi.fn() }).map((i) => i.label)).toEqual([
			"Download MP3",
			"Download original",
		]);
	});
	test("an editor's notes item: Add notes… with none, Edit notes… with some, before Remove", () => {
		const editNotes = vi.fn();
		const opts = { canEdit: true, save: vi.fn(), editNotes, remove: vi.fn() };
		const labels = (notes: string) => demoMenuItems({ ...d, notes }, opts).map((i) => i.label);
		expect(labels("")).toEqual(["Download MP3", "Download original", "Add notes…", "Remove demo"]);
		expect(labels("Rough take")).toContain("Edit notes…");
		demoMenuItems(d, opts)[2].action?.();
		expect(editNotes).toHaveBeenCalled();
	});
	test("a viewer never gets the notes item, even when the page passes one", () => {
		const items = demoMenuItems(
			{ ...d, notes: "Rough take" },
			{ canEdit: false, save: vi.fn(), editNotes: vi.fn() },
		);
		expect(items.map((i) => i.label)).toEqual(["Download MP3", "Download original"]);
	});
});
