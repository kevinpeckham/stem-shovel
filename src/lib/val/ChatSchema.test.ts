import * as v from "valibot";
import { describe, expect, test } from "vite-plus/test";
import { MAX_CHAT_ATTACHMENTS } from "#lib/constants/chatAttachments.js";
import { ChatEditSchema, ChatSendSchema } from "./ChatSchema";

/** A message's text as sent and as edited, and the files a send carries (docs/chat.md, "Attachments"). */
const ID = "V1StGXR8_Z5jdHi6B-myT";
const issue = (schema: v.GenericSchema, input: unknown) =>
	v.safeParse(schema, input).issues?.[0]?.message;

describe("ChatSendSchema", () => {
	test("an empty body passes (the remote function wants text or a file), trimmed; no attachments is []", () => {
		expect(v.parse(ChatSendSchema, { songId: ID, body: "   " })).toEqual({
			songId: ID,
			sessionId: "",
			body: "",
			mentions: [],
			attachments: [],
		});
	});
	test(`at most ${MAX_CHAT_ATTACHMENTS} attachments, each a nanoid`, () => {
		const ids = Array.from({ length: MAX_CHAT_ATTACHMENTS }, () => ID);
		expect(v.parse(ChatSendSchema, { songId: ID, body: "", attachments: ids }).attachments).toEqual(
			ids,
		);
		expect(issue(ChatSendSchema, { songId: ID, body: "", attachments: [...ids, ID] })).toBe(
			"Attach fewer files.",
		);
		expect(
			issue(ChatSendSchema, { songId: ID, body: "", attachments: ["not an id!"] }),
		).toBeTruthy();
	});
	test("the length cap holds", () => {
		expect(issue(ChatSendSchema, { songId: ID, body: "x".repeat(2001) })).toContain("under 2000");
	});
});

describe("ChatEditSchema", () => {
	test("an edit cannot empty a message", () => {
		expect(issue(ChatEditSchema, { id: ID, body: "  " })).toBe("Write something.");
		expect(v.parse(ChatEditSchema, { id: ID, body: " hi " }).body).toBe("hi");
	});
});
