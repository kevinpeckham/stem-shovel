import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { ChatAttachmentIdSchema, ChatAttachmentReserveSchema } from "./ChatAttachmentSchema";

/** A chat attachment's reserve and its id (docs/chat.md, "Attachments"). */
const ID = "V1StGXR8_Z5jdHi6B-myT";
const ok = (schema: v.GenericSchema, input: unknown) => v.safeParse(schema, input).success;

describe("ChatAttachmentReserveSchema", () => {
	test("a chat's id, a trimmed filename and a size; a missing id is ''", () => {
		expect(
			v.parse(ChatAttachmentReserveSchema, {
				songId: ID,
				filename: "  take.png ",
				sizeBytes: 1000,
			}),
		).toEqual({ songId: ID, sessionId: "", filename: "take.png", sizeBytes: 1000 });
		expect(
			ok(ChatAttachmentReserveSchema, { sessionId: ID, filename: "a.pdf", sizeBytes: 1 }),
		).toBe(true);
	});
	test("refuses a blank or long filename, a size that is not a number and an id that is not one", () => {
		const base = { songId: ID, filename: "a.pdf", sizeBytes: 1 };
		expect(ok(ChatAttachmentReserveSchema, { ...base, filename: "   " })).toBe(false);
		expect(ok(ChatAttachmentReserveSchema, { ...base, filename: "x".repeat(256) })).toBe(false);
		expect(ok(ChatAttachmentReserveSchema, { ...base, sizeBytes: "1" })).toBe(false);
		expect(ok(ChatAttachmentReserveSchema, { ...base, songId: "not an id!" })).toBe(false);
	});
});

describe("ChatAttachmentIdSchema", () => {
	test("a nanoid", () => {
		expect(ok(ChatAttachmentIdSchema, { id: ID })).toBe(true);
		expect(ok(ChatAttachmentIdSchema, { id: "" })).toBe(false);
	});
});
