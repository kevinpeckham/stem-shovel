import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { ActivityItemSchema } from "./ActivityItemSchema";

describe("ActivityItemSchema", () => {
	test("reads an event id as its kind and row id", () => {
		expect(v.parse(ActivityItemSchema, { id: "stem:abc_123" })).toEqual({
			kind: "stem",
			rowId: "abc_123",
		});
		expect(v.parse(ActivityItemSchema, { id: "session-comment:x-1" })).toEqual({
			kind: "session-comment",
			rowId: "x-1",
		});
	});
	test("refuses an unknown kind, a missing row id or stray characters", () => {
		for (const id of ["idea:abc", "stem:", "stem", "stem:a:b", "stem:a b", ""])
			expect(v.safeParse(ActivityItemSchema, { id }).success).toBe(false);
	});
});
