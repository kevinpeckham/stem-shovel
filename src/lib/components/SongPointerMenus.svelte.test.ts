import { render } from "@testing-library/svelte";
import { flushSync } from "svelte";
import { describe, expect, test, vi } from "vite-plus/test";
import type { StemEngine } from "#lib/audio/engine.svelte.js";
import type { SongComments } from "#lib/state/songComments.svelte.js";
import { formatTime } from "#lib/utils/formatTime.js";

/**
 * The song page's two menus at the pointer: the items each builds (the
 * notice, Seek here, Comment here when allowed) and what each item calls.
 * PointerMenu is a stand-in that keeps the props it was given, by aria label.
 */
type MenuProps = {
	at: unknown;
	items: { label?: string; notice?: string; action?: () => void }[];
	ariaLabel: string;
};
const h = vi.hoisted(() => ({ menus: new Map<string, MenuProps>() }));
vi.mock("#lib/components/PointerMenu.svelte", () => ({
	default: (_anchor: unknown, props: MenuProps) => {
		h.menus.set(props.ariaLabel, props);
	},
}));

const { default: SongPointerMenus } = await import("./SongPointerMenus.svelte");
const { SongPointerMenus: Menus } = await import("#lib/state/songPointerMenus.svelte.js");

const DEMO = "Actions at this spot in the demo";
const MIX = "Actions at this spot in the mix";

function setup({ canComment = true, canEdit = true } = {}) {
	h.menus.clear();
	const menus = new Menus();
	const demoPanel = { seekTo: vi.fn() };
	const engine = { seek: vi.fn() };
	const comments = { open: vi.fn() };
	render(SongPointerMenus, {
		menus,
		demoPanel,
		engine: engine as unknown as StemEngine,
		comments: comments as unknown as SongComments,
		editPos: (s: number) => `bar ${s}`,
		canComment,
		canEdit,
		showPos: (s: number) => `pos ${s}`,
	});
	return { menus, demoPanel, engine, comments };
}

describe("SongPointerMenus", () => {
	test("closed, both menus have no spot and no items", () => {
		setup();
		expect(h.menus.get(DEMO)?.at).toBeNull();
		expect(h.menus.get(DEMO)?.items).toEqual([]);
		expect(h.menus.get(MIX)?.at).toBeNull();
		expect(h.menus.get(MIX)?.items).toEqual([]);
	});

	test("a demo's menu: the notice, Seek here on the demo, Comment here on the demo", () => {
		const { menus, demoPanel, comments } = setup();
		menus.openDemo({ id: "d1", label: "Kitchen take" }, 83.4, 10, 20);
		flushSync();
		const items = h.menus.get(DEMO)!.items;
		expect(items[0].notice).toBe(`Kitchen take · ${formatTime(83.4, 1)}`);
		expect(items.map((i) => i.label)).toEqual([undefined, "Seek here", "Comment here"]);
		items[1].action!();
		expect(demoPanel.seekTo).toHaveBeenCalledWith(83.4);
		items[2].action!();
		expect(comments.open).toHaveBeenCalledWith({ at: formatTime(83.4, 2), demoId: "d1" });
	});

	test("the mix's menu: the notice, Seek here on the player, Comment here at the song position", () => {
		const { menus, engine, comments } = setup();
		menus.openMix(30, 40, 50);
		flushSync();
		const items = h.menus.get(MIX)!.items;
		expect(items[0].notice).toBe("Mix · pos 30");
		items[1].action!();
		expect(engine.seek).toHaveBeenCalledWith(30);
		items[2].action!();
		expect(comments.open).toHaveBeenCalledWith({ at: "bar 30" });
	});

	test("no Comment here without the right to comment or edit", () => {
		const { menus } = setup({ canComment: false, canEdit: false });
		menus.openDemo({ id: "d1", label: "Kitchen take" }, 1, 0, 0);
		menus.openMix(1, 0, 0);
		flushSync();
		expect(h.menus.get(DEMO)!.items.map((i) => i.label)).toEqual([undefined, "Seek here"]);
		expect(h.menus.get(MIX)!.items.map((i) => i.label)).toEqual([undefined, "Seek here"]);
	});
});
