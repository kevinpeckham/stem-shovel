import { beforeEach, describe, expect, test } from "vite-plus/test";
import { reset } from "../../../tests/helpers/fakeDataLayer";

/** The project page's chat summary (docs/chat.md): a count per song, and the unread of others' messages past the person's mark. */
const { chatSummaryOf } = await import("./data");

const at = (ms: number) => new Date(ms);

beforeEach(() => reset({}));

describe("chatSummaryOf", () => {
	test("counts every message, and as unread the others' past the mark (all of them with no mark); one's own never", async () => {
		reset({
			chatMessage: [
				{ songId: "s1", userId: "me", createdAt: at(1) },
				{ songId: "s1", userId: "u2", createdAt: at(2) },
				{ songId: "s1", userId: "u2", createdAt: at(10) },
				{ songId: "s2", userId: "u2", createdAt: at(3) },
				{ songId: "s3", userId: "u2", createdAt: at(3) },
			],
			chatRead: [
				{ userId: "me", songId: "s1", readAt: at(5) },
				{ userId: "other", songId: "s2", readAt: at(9) },
			],
		});
		const out = await chatSummaryOf(["s1", "s2"], "me");
		expect(out.get("s1")).toEqual({ count: 3, unread: 1 });
		expect(out.get("s2")).toEqual({ count: 1, unread: 1 });
		expect(out.has("s3")).toBe(false);
	});
	test("no songs: nothing asked", async () => {
		expect((await chatSummaryOf([], "me")).size).toBe(0);
	});
});
