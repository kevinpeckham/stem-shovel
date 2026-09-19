import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import {
	BugReportCreateSchema,
	BugReportStatusSchema,
	BugReportVoteSchema,
} from "./BugReportSchema";

describe("BugReportCreateSchema", () => {
	test("trims and defaults the captured fields", () => {
		expect(v.parse(BugReportCreateSchema, { title: " Play stops ", body: " at 1:30 " })).toEqual({
			kind: "bug",
			title: "Play stops",
			body: "at 1:30",
			pageUrl: "",
			userAgent: "",
			contactEmail: "",
		});
	});
	test("the contact email is optional, trimmed, and must be an address when given", () => {
		const base = { title: "x", body: "y" };
		expect(
			v.parse(BugReportCreateSchema, { ...base, contactEmail: " kev@example.com " }).contactEmail,
		).toBe("kev@example.com");
		expect(v.parse(BugReportCreateSchema, { ...base, contactEmail: "  " }).contactEmail).toBe("");
		expect(
			v.safeParse(BugReportCreateSchema, { ...base, contactEmail: "not an email" }).success,
		).toBe(false);
	});
	test("a feature request is the same form with kind = feature", () => {
		expect(
			v.parse(BugReportCreateSchema, {
				kind: "feature",
				title: "Loop a section",
				body: "for practice",
			}).kind,
		).toBe("feature");
		expect(
			v.safeParse(BugReportCreateSchema, { kind: "wish", title: "x", body: "y" }).success,
		).toBe(false);
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

describe("BugReportVoteSchema", () => {
	test("up, down or none", () => {
		const id = "V1StGXR8_Z5jdHi6B-myT";
		expect(v.safeParse(BugReportVoteSchema, { id, vote: "up" }).success).toBe(true);
		expect(v.safeParse(BugReportVoteSchema, { id, vote: "none" }).success).toBe(true);
		expect(v.safeParse(BugReportVoteSchema, { id, vote: "meh" }).success).toBe(false);
	});
});

describe("BugReportStatusSchema", () => {
	test("accepts only open or closed", () => {
		const id = "V1StGXR8_Z5jdHi6B-myT";
		expect(v.safeParse(BugReportStatusSchema, { id, status: "closed" }).success).toBe(true);
		expect(v.safeParse(BugReportStatusSchema, { id, status: "fixed" }).success).toBe(false);
	});
});
