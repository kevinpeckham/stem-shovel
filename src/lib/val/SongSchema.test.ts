import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import {
	DefaultMixSchema,
	SongDocSaveSchema,
	SongSettingsSchema,
	SongVersionSchema,
	StemRenameSchema,
} from "./SongSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";
const settings = { id, title: " Blue ", slug: "My-Song", startAt: "12.5", writtenOn: "2026-10-07" };

describe("SongSettingsSchema", () => {
	it("trims and lowercases what a form sends and fills in the defaults", () => {
		expect(v.parse(SongSettingsSchema, settings)).toEqual({
			id,
			title: "Blue",
			slug: "my-song",
			description: "",
			startAt: "12.5",
			endAt: "",
			version: "0.0.1",
			frameRate: "25",
			writtenOn: "2026-10-07",
		});
	});
	it("refuses a long description, a time that is not a number, a bad version, frame rate or date", () => {
		const fails = (patch: object) =>
			expect(v.safeParse(SongSettingsSchema, { ...settings, ...patch }).success).toBe(false);
		fails({ description: "x".repeat(2001) });
		fails({ startAt: "1:30" });
		fails({ endAt: "end" });
		fails({ version: "1.2" });
		fails({ frameRate: "60" });
		fails({ writtenOn: "7/10/2026" });
		fails({ slug: "Bad Slug" });
		fails({ title: "   " });
		expect(
			v.safeParse(SongSettingsSchema, { ...settings, description: "x".repeat(2000) }).success,
		).toBe(true);
	});
});

describe("SongVersionSchema", () => {
	it("takes major.minor.patch, trimmed", () => {
		expect(v.parse(SongVersionSchema, " 1.2.3 ")).toBe("1.2.3");
		expect(v.safeParse(SongVersionSchema, "v1.2.3").success).toBe(false);
	});
});

describe("DefaultMixSchema", () => {
	const gains = (n: number, gain = 1) => Array.from({ length: n }, () => ({ id, gain }));
	it("takes a fader per stem between 0 and 1.25", () => {
		expect(v.safeParse(DefaultMixSchema, { id, gains: gains(1, 1.25) }).success).toBe(true);
		expect(v.safeParse(DefaultMixSchema, { id, gains: gains(1, 0) }).success).toBe(true);
		expect(v.safeParse(DefaultMixSchema, { id, gains: gains(1, 1.26) }).success).toBe(false);
		expect(v.safeParse(DefaultMixSchema, { id, gains: gains(1, -0.1) }).success).toBe(false);
	});
	it("needs at least one stem and takes at most 64", () => {
		expect(v.safeParse(DefaultMixSchema, { id, gains: [] }).success).toBe(false);
		expect(v.safeParse(DefaultMixSchema, { id, gains: gains(64) }).success).toBe(true);
		expect(v.safeParse(DefaultMixSchema, { id, gains: gains(65) }).success).toBe(false);
	});
});

describe("StemRenameSchema and SongDocSaveSchema", () => {
	it("trim a label and refuse an empty one", () => {
		expect(v.parse(StemRenameSchema, { id, label: " Bass " }).label).toBe("Bass");
		expect(v.safeParse(StemRenameSchema, { id, label: " " }).success).toBe(false);
	});
	it("default confirmEmpty to false and cap the markdown", () => {
		const save = { songId: id, kind: "chart", markdown: "" };
		expect(v.parse(SongDocSaveSchema, save).confirmEmpty).toBe("false");
		expect(v.safeParse(SongDocSaveSchema, { ...save, markdown: "x".repeat(200_001) }).success).toBe(
			false,
		);
	});
});
