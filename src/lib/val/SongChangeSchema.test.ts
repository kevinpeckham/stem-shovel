import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { SongChangesSchema, SongChangesSaveSchema } from "./SongChangeSchema";
import { SongSectionsSchema } from "./SongSectionSchema";
import { SongSettingsSchema } from "./SongSchema";

describe("SongChangesSchema", () => {
	test("accepts valid changes and trims values", () => {
		const r = v.safeParse(SongChangesSchema, [{ kind: "tempo", start: 0, value: " 120 " }]);
		expect(r.success).toBe(true);
		if (r.success) expect(r.output[0].value).toBe("120");
	});
	test("rejects a bad value for the kind, a negative start, an unknown kind", () => {
		expect(
			v.safeParse(SongChangesSchema, [{ kind: "tempo", start: 0, value: "900" }]).success,
		).toBe(false);
		expect(
			v.safeParse(SongChangesSchema, [{ kind: "meter", start: -1, value: "4/4" }]).success,
		).toBe(false);
		expect(
			v.safeParse(SongChangesSchema, [{ kind: "mood", start: 0, value: "blue" }]).success,
		).toBe(false);
	});
	test("the save argument needs an id", () => {
		expect(v.safeParse(SongChangesSaveSchema, { id: "", changes: [] }).success).toBe(false);
		expect(v.safeParse(SongChangesSaveSchema, { id: "abc", changes: [] }).success).toBe(true);
	});
});

describe("SongSectionsSchema", () => {
	test("index is optional, name is required and short", () => {
		expect(v.safeParse(SongSectionsSchema, [{ name: "Intro", start: 0 }]).success).toBe(true);
		expect(v.safeParse(SongSectionsSchema, [{ index: "I", name: "", start: 0 }]).success).toBe(
			false,
		);
		expect(v.safeParse(SongSectionsSchema, [{ name: "x".repeat(41), start: 0 }]).success).toBe(
			false,
		);
	});
});

describe("SongSettingsSchema", () => {
	const base = { id: "V1StGXR8_Z5jdHi6B-myT", title: "Song", slug: "song" };
	test("defaults the optional fields", () => {
		const r = v.safeParse(SongSettingsSchema, base);
		expect(r.success).toBe(true);
		if (r.success) {
			expect(r.output.description).toBe("");
			expect(r.output.writtenOn).toBe("");
			expect(r.output.frameRate).toBe("25");
			expect(r.output.startAt).toBe("");
		}
	});
	test("written-on must be an ISO date; start and end are decimal seconds", () => {
		expect(v.safeParse(SongSettingsSchema, { ...base, writtenOn: "June 2019" }).success).toBe(
			false,
		);
		expect(v.safeParse(SongSettingsSchema, { ...base, writtenOn: "2019-06-15" }).success).toBe(
			true,
		);
		expect(v.safeParse(SongSettingsSchema, { ...base, startAt: "88.25" }).success).toBe(true);
		expect(v.safeParse(SongSettingsSchema, { ...base, startAt: "1:28" }).success).toBe(false);
		expect(v.safeParse(SongSettingsSchema, { ...base, frameRate: "50" }).success).toBe(false);
	});
});
