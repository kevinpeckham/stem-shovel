import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { SongStage } from "#lib/val/SongStageSchema.js";
import { SongPlayerLayout } from "./songPlayerLayout.svelte.js";

/** The player's view (the stage's pick, a view with nothing giving way, the visitor's pick) and its docked / floating / minimized mode. */
function setup({ stage = "arranging" as SongStage, stems = 1, demos = 1, mixes = 1 } = {}) {
	const engine = { pause: vi.fn() };
	const demoPanel = { pause: vi.fn() };
	const layout = new SongPlayerLayout({
		stage: () => stage,
		stemCount: () => stems,
		demoCount: () => demos,
		mixCount: () => mixes,
		engine: () => engine,
		demoPanel: () => demoPanel,
	});
	return { layout, engine, demoPanel };
}

/** A localStorage stand-in, so the remembered mode can be read back. */
function stubStorage(initial: Record<string, string> = {}) {
	const store = new Map(Object.entries(initial));
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
	});
	return store;
}

const KEY = "stemshovel.song.player-mode";

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("SongPlayerLayout", () => {
	test("the stage picks the view: writing the demos, arranging the stems, mixing and finished the mixes", () => {
		expect(setup({ stage: "writing" }).layout.view).toBe("demos");
		expect(setup({ stage: "arranging" }).layout.view).toBe("stems");
		expect(setup({ stage: "mixing" }).layout.view).toBe("mixes");
		expect(setup({ stage: "finished" }).layout.view).toBe("mixes");
	});

	test("a view with nothing in it gives way, in the stage's order; nothing at all is the stems", () => {
		expect(setup({ stage: "mixing", mixes: 0 }).layout.view).toBe("stems");
		expect(setup({ stage: "mixing", mixes: 0, stems: 0 }).layout.view).toBe("demos");
		expect(setup({ stage: "writing", demos: 0 }).layout.view).toBe("stems");
		expect(setup({ stage: "arranging", stems: 0 }).layout.view).toBe("mixes");
		expect(setup({ stems: 0, demos: 0, mixes: 0 }).layout.view).toBe("stems");
	});

	test("show() picks the view and pauses what is not shown", () => {
		const { layout, engine, demoPanel } = setup();
		layout.show("demos");
		expect(layout.view).toBe("demos");
		expect(engine.pause).toHaveBeenCalledTimes(1);
		expect(demoPanel.pause).not.toHaveBeenCalled();
		layout.show("stems");
		expect(layout.view).toBe("stems");
		expect(demoPanel.pause).toHaveBeenCalledTimes(1);
		layout.show("mixes");
		expect(engine.pause).toHaveBeenCalledTimes(2);
		expect(demoPanel.pause).toHaveBeenCalledTimes(2);
	});

	test("the views in the tabs' order; no stem box measured yet", () => {
		expect(SongPlayerLayout.VIEWS).toEqual(["stems", "demos", "mixes"]);
		expect(setup().layout.stemBoxHeight).toBe(0);
	});

	test("setMode remembers the mode; toggle minimizes and restores the way it was", () => {
		const store = stubStorage();
		const { layout } = setup();
		expect(layout.mode).toBe("docked");
		layout.setMode("floating");
		expect(store.get(KEY)).toBe("floating");
		layout.toggle();
		expect(layout.mode).toBe("minimised");
		expect(store.get(KEY)).toBe("minimised");
		layout.toggle();
		expect(layout.mode).toBe("floating");
	});

	test("load() reads the remembered mode and ignores anything else", () => {
		stubStorage({ [KEY]: "minimised" });
		const { layout } = setup();
		layout.load();
		expect(layout.mode).toBe("minimised");
		stubStorage({ [KEY]: "sideways" });
		const other = setup().layout;
		other.load();
		expect(other.mode).toBe("docked");
	});

	test("storage that throws (private mode): the mode still changes, load() stays docked", () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("denied");
			},
		});
		const { layout } = setup();
		layout.load();
		expect(layout.mode).toBe("docked");
		layout.setMode("floating");
		expect(layout.mode).toBe("floating");
	});
});
