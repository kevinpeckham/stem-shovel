import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { PrivacySchema, ShareLinkCreateSchema } from "./ShareLinkSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";

describe("ShareLinkCreateSchema", () => {
	test("one of song or project, with defaults", () => {
		expect(v.parse(ShareLinkCreateSchema, { songId: id })).toEqual({
			songId: id,
			mixId: "",
			projectId: "",
			recordingId: "",
			note: "",
			maxUses: null,
			expiresDays: 0,
		});
		// A session recording's link (docs/uploads-and-blob.md, "Sessions") is the third kind, one at a time.
		expect(v.parse(ShareLinkCreateSchema, { recordingId: id })).toMatchObject({ recordingId: id });
		expect(v.safeParse(ShareLinkCreateSchema, { recordingId: id, songId: id }).success).toBe(false);
		expect(
			v.parse(ShareLinkCreateSchema, { projectId: id, maxUses: "3", expiresDays: "30" }),
		).toMatchObject({ projectId: id, maxUses: 3, expiresDays: 30 });
	});
	test("refuses neither, both, or a bad id", () => {
		expect(v.safeParse(ShareLinkCreateSchema, {}).success).toBe(false);
		expect(v.safeParse(ShareLinkCreateSchema, { songId: id, projectId: id }).success).toBe(false);
		expect(v.safeParse(ShareLinkCreateSchema, { songId: "not an id!" }).success).toBe(false);
	});
});

describe("PrivacySchema", () => {
	test("takes the string a hidden input sends", () => {
		expect(v.parse(PrivacySchema, { id, isPrivate: "true" }).isPrivate).toBe("true");
		expect(v.safeParse(PrivacySchema, { id, isPrivate: "yes" }).success).toBe(false);
	});
});
