import { describe, expect, test } from "vite-plus/test";
import {
	DAWN_FEATURE_COLUMNS,
	DAWN_FEATURE_GROUPS,
	DAWN_FEATURE_SUPPORT_VALUES,
} from "./dawnFeatures";

const features = DAWN_FEATURE_GROUPS.flatMap((g) => g.features);
const keys = DAWN_FEATURE_COLUMNS.map((c) => c.key);

describe("DAWN_FEATURE_COLUMNS", () => {
	test("starts with Dawn and has unique keys", () => {
		expect(keys[0]).toBe("dawn");
		expect(new Set(keys).size).toBe(keys.length);
	});
});

describe("DAWN_FEATURE_GROUPS", () => {
	test("every group has features and a unique title", () => {
		const titles = DAWN_FEATURE_GROUPS.map((g) => g.title);
		expect(new Set(titles).size).toBe(titles.length);
		for (const g of DAWN_FEATURE_GROUPS) expect(g.features.length).toBeGreaterThan(0);
	});

	test("feature names are unique", () => {
		const names = features.map((f) => f.name);
		expect(new Set(names).size).toBe(names.length);
	});

	test.each(features.map((f) => [f.name, f] as const))(
		"%s has every column and only allowed values",
		(_, f) => {
			expect(Object.keys(f.support).sort()).toEqual([...keys].sort());
			for (const value of Object.values(f.support))
				expect(DAWN_FEATURE_SUPPORT_VALUES).toContain(value);
			for (const key of Object.keys(f.cellNotes ?? {})) expect(keys).toContain(key);
		},
	);

	test("every partial cell is explained by a cell note or the row's note", () => {
		for (const f of features)
			for (const key of keys)
				if (f.support[key] === "partial") expect(f.cellNotes?.[key] ?? f.note).toBeTruthy();
	});
});
