import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { UserDocCreateSchema, UserDocMetaSchema, UserDocSaveSchema } from "./UserDocSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";

describe("UserDocSchema", () => {
	test("a new page needs a title", () => {
		expect(v.parse(UserDocCreateSchema, { title: " Getting started " })).toEqual({
			title: "Getting started",
			kind: "doc",
		});
		expect(v.parse(UserDocCreateSchema, { title: "Why stems", kind: "post" }).kind).toBe("post");
		expect(v.safeParse(UserDocCreateSchema, { title: "x", kind: "page" }).success).toBe(false);
		expect(v.safeParse(UserDocCreateSchema, { title: " " }).success).toBe(false);
	});
	test("meta reads the order a form sends and checks the slug", () => {
		expect(
			v.parse(UserDocMetaSchema, { id, title: "Uploads", slug: "uploads", sortOrder: "2" }),
		).toEqual({ id, title: "Uploads", slug: "uploads", sortOrder: 2, published: false });
		expect(
			v.parse(UserDocMetaSchema, { id, title: "x", slug: "x", published: true }).published,
		).toBe(true);
		expect(v.parse(UserDocMetaSchema, { id, title: "Uploads", slug: "uploads" }).sortOrder).toBe(0);
		expect(
			v.safeParse(UserDocMetaSchema, { id, title: "Uploads", slug: "Not A Slug" }).success,
		).toBe(false);
		expect(
			v.safeParse(UserDocMetaSchema, { id, title: "x", slug: "x", sortOrder: "1.5" }).success,
		).toBe(false);
	});
	test("save defaults confirmEmpty", () => {
		expect(v.parse(UserDocSaveSchema, { id, markdown: "# Hi" }).confirmEmpty).toBe("false");
	});
});
