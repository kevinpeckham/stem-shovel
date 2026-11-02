import { describe, expect, test, vi } from "vite-plus/test";
import { ChordDialectChoice } from "./chordDialect.svelte.js";

const KEY = "stemshovel.song.chord-dialect";
/** A menu item as the tests read it (the component type does not reach the type-aware linter). */
type Item = { id?: unknown; label?: unknown; iconClass?: unknown; action?: unknown };

/** A localStorage stand-in, so the remembered choice can be read back. */
function stubStorage(initial: Record<string, string> = {}) {
	const store = new Map<string, string>(Object.entries(initial));
	vi.stubGlobal("localStorage", {
		getItem: (k: string) => store.get(k) ?? null,
		setItem: (k: string, v: string) => void store.set(k, v),
	});
	return store;
}

describe("ChordDialectChoice", () => {
	test("starts on chord names", () => {
		const c = new ChordDialectChoice();
		expect(c.dialect).toBe("names");
		expect(c.numerals).toBeNull();
		expect(c.short).toBe("Names");
	});

	test("set spells chords and remembers the choice under the song page's key", () => {
		const store = stubStorage();
		const c = new ChordDialectChoice();
		c.set("nashville");
		expect(c.dialect).toBe("nashville");
		expect(c.numerals).toBe("nashville");
		expect(c.short).toBe("Nashville");
		expect(store.get(KEY)).toBe("nashville");
	});

	test("set still applies when storage throws (private mode)", () => {
		vi.stubGlobal("localStorage", {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("denied");
			},
		});
		const c = new ChordDialectChoice();
		c.set("roman");
		expect(c.dialect).toBe("roman");
		expect(() => c.load()).not.toThrow();
		expect(c.dialect).toBe("roman");
	});

	test("load restores a valid stored value", () => {
		stubStorage({ [KEY]: "roman" });
		const c = new ChordDialectChoice();
		c.load();
		expect(c.dialect).toBe("roman");
		expect(c.numerals).toBe("roman");
	});

	test("load ignores an invalid stored value", () => {
		stubStorage({ [KEY]: "solfege" });
		const c = new ChordDialectChoice();
		c.load();
		expect(c.dialect).toBe("names");
	});

	test("items check the current spelling, and an item's action sets it", () => {
		const store = stubStorage();
		const c = new ChordDialectChoice();
		expect(c.items.map((i: Item) => i.id)).toEqual(["names", "nashville", "roman"]);
		expect(c.items.map((i: Item) => i.label)).toEqual([
			"Chord names",
			"Nashville numbers",
			"Roman numerals",
		]);
		expect(c.items.map((i: Item) => i.iconClass)).toEqual([
			"i-ph-check",
			"i-ph-check invisible",
			"i-ph-check invisible",
		]);
		const roman = c.items.find((i: Item) => i.id === "roman") as Item;
		(roman.action as () => void)();
		expect(c.dialect).toBe("roman");
		expect(store.get(KEY)).toBe("roman");
		expect(c.items.map((i: Item) => i.iconClass)).toEqual([
			"i-ph-check invisible",
			"i-ph-check invisible",
			"i-ph-check",
		]);
	});
});
