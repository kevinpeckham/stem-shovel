import { describe, expect, it } from "vite-plus/test";
import * as v from "valibot";
import {
	CommentHistorySchema,
	CommentVersionRestoreSchema,
	DocHistorySchema,
	DocVersionRestoreSchema,
} from "./HistorySchema";

const songId = "V1StGXR8_Z5jdHi6B-myT";
const versionId = "FfWbYCkJWMkPWRZkwpmsP";

describe("DocHistorySchema", () => {
	it("takes a song and any save kind, the private note included", () => {
		for (const kind of ["chart", "lyrics", "notes", "mynotes"]) {
			expect(v.safeParse(DocHistorySchema, { songId, kind }).success).toBe(true);
		}
	});

	it("refuses an unknown kind and a made-up id", () => {
		expect(v.safeParse(DocHistorySchema, { songId, kind: "secret" }).success).toBe(false);
		expect(v.safeParse(DocHistorySchema, { songId: "not an id", kind: "chart" }).success).toBe(
			false,
		);
	});
});

describe("DocVersionRestoreSchema", () => {
	it("needs the revision's id as well", () => {
		expect(
			v.safeParse(DocVersionRestoreSchema, { songId, kind: "lyrics", versionId }).success,
		).toBe(true);
		expect(v.safeParse(DocVersionRestoreSchema, { songId, kind: "lyrics" }).success).toBe(false);
	});
});

describe("comment history schemas", () => {
	it("take nanoids only", () => {
		expect(v.safeParse(CommentHistorySchema, { commentId: songId }).success).toBe(true);
		expect(v.safeParse(CommentHistorySchema, { commentId: "" }).success).toBe(false);
		expect(v.safeParse(CommentVersionRestoreSchema, { commentId: songId, versionId }).success).toBe(
			true,
		);
		expect(
			v.safeParse(CommentVersionRestoreSchema, { commentId: songId, versionId: "not an id" })
				.success,
		).toBe(false);
	});
});
