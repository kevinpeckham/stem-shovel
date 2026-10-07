import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import { SongFileAttachSchema, SongFileUpdateSchema } from "./SongFileSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("SongFileUpdateSchema", () => {
	it("trims the title and description, which may be empty, and takes the notation flag", () => {
		expect(v.parse(SongFileUpdateSchema, { id, title: " Lead sheet ", description: "  " })).toEqual(
			{ id, title: "Lead sheet", description: "" },
		);
		const flagged = { id, isNotation: true, title: "", description: "" };
		expect(v.parse(SongFileUpdateSchema, flagged).isNotation).toBe(true);
	});
	it("caps the title at 120 and the description at 1000 characters", () => {
		const full = { id, title: "x".repeat(120), description: "x".repeat(1000) };
		expect(ok(SongFileUpdateSchema, full)).toBe(true);
		expect(ok(SongFileUpdateSchema, { ...full, title: "x".repeat(121) })).toBe(false);
		expect(ok(SongFileUpdateSchema, { ...full, description: "x".repeat(1001) })).toBe(false);
	});
});

describe("SongFileAttachSchema", () => {
	it("takes a song id or null for the project level", () => {
		expect(v.parse(SongFileAttachSchema, { id, songId: null }).songId).toBeNull();
		expect(ok(SongFileAttachSchema, { id, songId: id })).toBe(true);
		expect(ok(SongFileAttachSchema, { id, songId: "" })).toBe(false);
		expect(ok(SongFileAttachSchema, { id })).toBe(false);
	});
});
