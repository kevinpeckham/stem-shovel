import { describe, expect, test } from "vite-plus/test";
import * as v from "valibot";
import { ShareSongSchema } from "./ShareSongSchema";

const id = "V1StGXR8_Z5jdHi6B-myT";

describe("ShareSongSchema", () => {
	test("the song alone, or aimed at a mix or a demo of it", () => {
		expect(v.parse(ShareSongSchema, { songId: id, to: "a@example.com" })).toMatchObject({
			songId: id,
			mixId: "",
			demoId: "",
			message: "",
		});
		expect(v.parse(ShareSongSchema, { songId: id, demoId: id, to: "a@example.com" })).toMatchObject(
			{ demoId: id, mixId: "" },
		);
		expect(
			v.safeParse(ShareSongSchema, { songId: id, demoId: "nope!", to: "a@example.com" }).success,
		).toBe(false);
	});
	test("never a mix and a demo together", () => {
		const both = v.safeParse(ShareSongSchema, {
			songId: id,
			mixId: id,
			demoId: id,
			to: "a@example.com",
		});
		expect(both.success).toBe(false);
		expect(both.issues?.[0].message).toBe("Share a mix or a demo of the song, not both.");
	});
});
