import { parseChart } from "barmark";
import { describe, expect, test, vi } from "vite-plus/test";
import { ChartKeyChoice } from "./chartKey.svelte.js";

const KEY = "stemshovel.song.chart-key.song1";
/** A menu item as the tests read it (the component type does not reach the type-aware linter). */
type Item = { id?: unknown; label?: unknown; iconClass?: unknown; action?: unknown };

/** Choose a menu item. */
function run(items: Item[], i: number) {
	const action = items[i]?.action;
	if (typeof action !== "function") throw new Error(`no action at ${i}`);
	(action as () => void)();
}

/** A localStorage stand-in, so the remembered choice can be read back. */
function stubStorage(initial: Record<string, string> = {}) {
	const store = new Map<string, string>(Object.entries(initial));
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
	});
	return store;
}

const G_MAJOR = "key: G\n\n| G | D/F# | Em7 | C |\n";
const E_MINOR = "key: Em\n\n| Em | C | G | D |\n";
const KEYLESS = "| D | A |\n";

describe("ChartKeyChoice", () => {
	test("starts in the original key", () => {
		const k = new ChartKeyChoice("song1");
		expect(k.semitones).toBe(0);
		expect(k.text(G_MAJOR)).toBe(G_MAJOR);
	});

	test("set remembers the choice under the song's own key", () => {
		const store = stubStorage();
		const k = new ChartKeyChoice("song1");
		k.set(2);
		expect(k.semitones).toBe(2);
		expect(store.get(KEY)).toBe("2");
		const again = new ChartKeyChoice("song1");
		again.load();
		expect(again.semitones).toBe(2);
		const other = new ChartKeyChoice("song2");
		other.load();
		expect(other.semitones).toBe(0);
	});

	test("set normalizes into −5..+6", () => {
		stubStorage();
		const k = new ChartKeyChoice("song1");
		k.set(7);
		expect(k.semitones).toBe(-5);
		k.set(-6);
		expect(k.semitones).toBe(6);
		k.set(12);
		expect(k.semitones).toBe(0);
		k.set(-13);
		expect(k.semitones).toBe(-1);
	});

	test("load ignores values out of range or not integers, and storage that throws", () => {
		stubStorage({ [KEY]: "9" });
		const k = new ChartKeyChoice("song1");
		k.load();
		expect(k.semitones).toBe(0);
		stubStorage({ [KEY]: "1.5" });
		k.load();
		expect(k.semitones).toBe(0);
		stubStorage({ [KEY]: "-5" });
		k.load();
		expect(k.semitones).toBe(-5);
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("denied");
			},
		});
		expect(() => k.load()).not.toThrow();
		k.set(3);
		expect(k.semitones).toBe(3);
	});

	test("text transposes the chart with barmark", () => {
		stubStorage();
		const k = new ChartKeyChoice("song1");
		k.set(2);
		const text = k.text(G_MAJOR);
		expect(parseChart(text).bars[0]?.key?.tonic).toBe("A");
		expect(text).toBe("key: A\n\n| A | E/G# | F#m7 | D |\n");
	});

	test("label names the key shown: a major chart", () => {
		stubStorage();
		const k = new ChartKeyChoice("song1");
		expect(k.label(G_MAJOR)).toBe("G");
		k.set(1);
		expect(k.label(G_MAJOR)).toBe("Ab");
		k.set(-1);
		expect(k.label(G_MAJOR)).toBe("F#");
	});

	test("label names the key shown: a minor chart", () => {
		stubStorage();
		const k = new ChartKeyChoice("song1");
		expect(k.label(E_MINOR)).toBe("Em");
		k.set(-2);
		expect(k.label(E_MINOR)).toBe("Dm");
		k.set(6);
		expect(k.label(E_MINOR)).toBe("Bbm");
	});

	test("label for a chart with no key: Original, then the distance with a real minus sign", () => {
		stubStorage();
		const k = new ChartKeyChoice("song1");
		expect(k.label(KEYLESS)).toBe("Original");
		k.set(3);
		expect(k.label(KEYLESS)).toBe("+3");
		k.set(-2);
		expect(k.label(KEYLESS)).toBe("−2");
		expect(k.label("")).toBe("−2");
	});

	test("items for a keyed chart: twelve keys from the original, the current one checked", () => {
		stubStorage();
		const k = new ChartKeyChoice("song1");
		const items = k.items(G_MAJOR) as Item[];
		expect(items.map((i) => i.label)).toEqual([
			"G (original)",
			"Ab",
			"A",
			"Bb",
			"B",
			"C",
			"Db",
			"D",
			"Eb",
			"E",
			"F",
			"F#",
		]);
		expect(items[0]?.iconClass).toBe("i-ph-check");
		expect(items[1]?.iconClass).toBe("i-ph-check invisible");
		run(items, 7);
		expect(k.semitones).toBe(-5);
		run(items, 2);
		expect(k.semitones).toBe(2);
		const after = k.items(G_MAJOR) as Item[];
		expect(after[2]?.iconClass).toBe("i-ph-check");
		expect(after[0]?.iconClass).toBe("i-ph-check invisible");
	});

	test("items for a keyless chart: Original, Up 1–6, Down 1–5", () => {
		stubStorage();
		const k = new ChartKeyChoice("song1");
		const items = k.items(KEYLESS) as Item[];
		expect(items.map((i) => i.label)).toEqual([
			"Original",
			"Up 1",
			"Up 2",
			"Up 3",
			"Up 4",
			"Up 5",
			"Up 6",
			"Down 1",
			"Down 2",
			"Down 3",
			"Down 4",
			"Down 5",
		]);
		expect(items[0]?.iconClass).toBe("i-ph-check");
		run(items, 9);
		expect(k.semitones).toBe(-3);
		expect((k.items(KEYLESS) as Item[])[9]?.iconClass).toBe("i-ph-check");
	});
});
