import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import { SONG_DOC_KINDS, SongDocKindSchema, SongDocSaveKindSchema } from "./SongDocKindSchema";

describe("SongDocSaveKindSchema", () => {
	it("accepts the shared documents and the private note", () => {
		for (const kind of [...SONG_DOC_KINDS, "mynotes"]) {
			expect(v.safeParse(SongDocSaveKindSchema, kind).success).toBe(true);
		}
	});

	it("keeps the private note out of the shared document kinds", () => {
		expect(v.safeParse(SongDocKindSchema, "mynotes").success).toBe(false);
		expect((SONG_DOC_KINDS as readonly string[]).includes("mynotes")).toBe(false);
	});

	it("refuses anything else", () => {
		expect(v.safeParse(SongDocSaveKindSchema, "secret").success).toBe(false);
	});
});
