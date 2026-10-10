import { NamedAmpPresetSchema, type AmpPresetData } from "#lib/val/AmpPresetSchema.js";
import * as v from "valibot";
import { beforeEach, describe, expect, it, vi } from "vite-plus/test";

// data.ts reaches the database and Blob; both are stubbed.
const { fake } = await vi.hoisted(async () => ({
	fake: (await import("../../../tests/helpers/fakeDb")).fakeDb(),
}));
vi.mock("#lib/server/db/index.js", async () => ({
	db: fake,
	schema: await import("#lib/server/db/schema/index.js"),
}));
vi.mock("#lib/server/blob.js", () => ({
	presentUrl: vi.fn(async (url: string | null | undefined) => url ?? null),
	deleteBlobs: vi.fn(async () => {}),
	recordingAccess: vi.fn(() => "private" as const),
}));

const {
	countAmpPresets,
	createAmpPreset,
	deleteAmpPreset,
	listAmpPresets,
	renameAmpPreset,
	setAmpPresetSlot,
	setSiteAmpPreset,
	siteAmpPresets,
	updateAmpPreset,
} = await import("./data");

const at = (minute: number) => new Date(Date.UTC(2026, 9, 10, 12, minute));
const ids = (rows: { id?: unknown }[]) => rows.map((r) => String(r.id));
const rig = { model: "clean" } as AmpPresetData;
const presetOf = (
	id: string,
	accountId: string,
	instrument: "guitar" | "bass",
	slot: number | null,
	minute: number,
) => ({
	id,
	accountId,
	createdBy: "u1",
	name: id,
	instrument,
	slot,
	data: rig,
	createdAt: at(minute),
	updatedAt: at(minute),
});
const presets = {
	ampPreset: [
		presetOf("ap1", "a1", "guitar", 3, 1),
		presetOf("ap2", "a1", "bass", 3, 2),
		presetOf("ap3", "a1", "guitar", 1, 3),
		presetOf("ap4", "a2", "guitar", 3, 4),
		presetOf("ap5", "a1", "guitar", null, 0),
	],
};
const slotsOf = () => Object.fromEntries(fake.rows("ampPreset").map((r) => [r.id, r.slot]));

describe("amp presets (docs/practice-amp.md, Presets)", () => {
	beforeEach(() => fake.reset(presets));
	it("listAmpPresets: the slotted ones by slot (newest first within one), then the rest newest first", async () => {
		expect(ids(await listAmpPresets("a1"))).toEqual(["ap3", "ap2", "ap1", "ap5"]);
	});
	it("createAmpPreset: takes the slot from its previous holder, in the account and the instrument only", async () => {
		const row = await createAmpPreset("a1", "u1", " ", "guitar", rig, 3);
		expect(row).toMatchObject({ name: "Untitled preset", instrument: "guitar", slot: 3 });
		// The bass preset on slot 3 and the other account's keep theirs.
		expect(slotsOf()).toMatchObject({ ap1: null, ap2: 3, ap4: 3, [row.id]: 3 });
	});
	it("updateAmpPreset: a slot given moves the button, one left out keeps it; another account's is null", async () => {
		expect(
			await updateAmpPreset("a1", "ap5", { name: "N", instrument: "guitar", data: rig, slot: 1 }),
		).toMatchObject({ slot: 1 });
		expect(slotsOf()).toMatchObject({ ap3: null, ap5: 1 });
		expect(
			await updateAmpPreset("a1", "ap1", { name: "M", instrument: "guitar", data: rig }),
		).toMatchObject({ slot: 3 });
		expect(
			await updateAmpPreset("a2", "ap1", { name: "M", instrument: "guitar", data: rig }),
		).toBeNull();
	});
	it("renameAmpPreset: a blank name is 'Untitled preset'; setAmpPresetSlot frees the slot within the instrument", async () => {
		expect(await renameAmpPreset("a1", "ap1", " ")).toMatchObject({ name: "Untitled preset" });
		expect(await renameAmpPreset("a2", "ap1", "Z")).toBeNull();
		expect(await setAmpPresetSlot("a1", "ap5", 3)).toMatchObject({ slot: 3 });
		expect(slotsOf()).toMatchObject({ ap1: null, ap2: 3, ap5: 3 });
		expect(await setAmpPresetSlot("a2", "ap1", 1)).toBeNull();
		expect(slotsOf()).toMatchObject({ ap3: 1 });
	});
	it("deleteAmpPreset: scoped; countAmpPresets counts the account's", async () => {
		expect(await countAmpPresets("a1")).toBe(4);
		await deleteAmpPreset("a2", "ap1");
		await deleteAmpPreset("a1", "ap5");
		expect(ids(fake.rows("ampPreset"))).toEqual(["ap1", "ap2", "ap3", "ap4"]);
		expect(await countAmpPresets("a1")).toBe(3);
	});
});

describe("site amp presets", () => {
	const warm = v.parse(NamedAmpPresetSchema, { name: "Warm", data: { model: "fridge" } });
	it("six empty slots per instrument without a setting, the entries that parse with one", async () => {
		fake.reset({});
		expect(await siteAmpPresets("guitar")).toHaveLength(6);
		expect((await siteAmpPresets("guitar")).every((s) => s === null)).toBe(true);
		await setSiteAmpPreset("bass", 2, warm);
		expect(await siteAmpPresets("bass")).toEqual([null, warm, null, null, null, null]);
		expect((await siteAmpPresets("guitar")).every((s) => s === null)).toBe(true);
		await setSiteAmpPreset("bass", 2, null);
		expect((await siteAmpPresets("bass")).every((s) => s === null)).toBe(true);
	});
});
