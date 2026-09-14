import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { CommentCreateSchema } from "./CommentSchema";

const base = { songId: "V1StGXR8_Z5jdHi6B-myT", title: "Bridge", body: "Try it half time." };

describe("CommentCreateSchema", () => {
	test("accepts a titled comment with or without a position", () => {
		expect(v.safeParse(CommentCreateSchema, base).success).toBe(true);
		expect(v.safeParse(CommentCreateSchema, { ...base, position: "88.25" }).success).toBe(true);
	});
	test("requires a title and a body, and bounds the position text", () => {
		expect(v.safeParse(CommentCreateSchema, { ...base, title: "  " }).success).toBe(false);
		expect(v.safeParse(CommentCreateSchema, { ...base, body: "" }).success).toBe(false);
		expect(v.safeParse(CommentCreateSchema, { ...base, position: "x".repeat(33) }).success).toBe(
			false,
		);
	});
});
