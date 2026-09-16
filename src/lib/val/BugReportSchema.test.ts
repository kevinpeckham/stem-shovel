import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { BugReportCreateSchema, BugReportStatusSchema } from "./BugReportSchema";

describe("BugReportCreateSchema", () => {
	test("trims and defaults the captured fields", () => {
		expect(v.parse(BugReportCreateSchema, { title: " Play stops ", body: " at 1:30 " })).toEqual({
			title: "Play stops",
			body: "at 1:30",
			pageUrl: "",
			userAgent: "",
		});
	});
	test("needs a title and a description", () => {
		expect(v.safeParse(BugReportCreateSchema, { title: "", body: "x" }).success).toBe(false);
		expect(v.safeParse(BugReportCreateSchema, { title: "x", body: "  " }).success).toBe(false);
	});
	test("bounds the lengths", () => {
		expect(v.safeParse(BugReportCreateSchema, { title: "x".repeat(121), body: "y" }).success).toBe(
			false,
		);
	});
});

describe("BugReportStatusSchema", () => {
	test("accepts only open or closed", () => {
		const id = "V1StGXR8_Z5jdHi6B-myT";
		expect(v.safeParse(BugReportStatusSchema, { id, status: "closed" }).success).toBe(true);
		expect(v.safeParse(BugReportStatusSchema, { id, status: "fixed" }).success).toBe(false);
	});
});
