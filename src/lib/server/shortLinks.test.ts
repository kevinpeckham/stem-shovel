import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const fake = vi.hoisted(() => ({
	findFirst: vi.fn(),
	values: vi.fn(),
	where: vi.fn(),
	returning: vi.fn(),
	ran: [] as Promise<void>[],
}));
vi.mock("#lib/server/db/index.js", () => ({
	db: {
		query: { shortLink: { findFirst: fake.findFirst } },
		insert: () => ({ values: fake.values }),
		update: () => ({ set: () => ({ where: fake.where }) }),
		delete: () => ({ where: () => ({ returning: fake.returning }) }),
	},
}));
vi.mock("#lib/server/background.js", () => ({
	background: (work: () => Promise<void>) => {
		fake.ran.push(work());
	},
}));

const { mintShortLink, purgeExpiredShortLinks, resolveShortLink } = await import("./shortLinks");

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 6, 12);
const codeShape = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{8}$/;

beforeEach(() => {
	fake.findFirst.mockReset();
	fake.values.mockReset().mockResolvedValue(undefined);
	fake.where.mockReset().mockResolvedValue(undefined);
	fake.returning.mockReset();
	fake.ran.length = 0;
});

describe("mintShortLink", () => {
	test("a signed-in user's link has an 8-character code and never expires", async () => {
		fake.findFirst.mockResolvedValue(undefined);
		const made = await mintShortLink(
			{ target: "/piano?x=1", kind: "piano", userId: "u1", accountId: "a1" },
			now,
		);
		expect(made.code).toMatch(codeShape);
		expect(made.expiresAt).toBeNull();
		expect(fake.values).toHaveBeenCalledWith(
			expect.objectContaining({
				code: made.code,
				target: "/piano?x=1",
				kind: "piano",
				createdBy: "u1",
				accountId: "a1",
				expiresAt: null,
			}),
		);
	});
	test("an anonymous link expires after ninety days", async () => {
		fake.findFirst.mockResolvedValue(undefined);
		const made = await mintShortLink(
			{ target: "/chord-player#k=C", kind: "chord-player", userId: null, accountId: null },
			now,
		);
		expect(made.expiresAt?.getTime()).toBe(now + 90 * DAY);
		expect(fake.values).toHaveBeenCalledWith(
			expect.objectContaining({ createdBy: null, accountId: null, expiresAt: made.expiresAt }),
		);
	});
	test("the same target again answers the code that exists, without a new row", async () => {
		fake.findFirst.mockResolvedValue({ code: "AbCd2345", expiresAt: null });
		const made = await mintShortLink(
			{ target: "/piano?x=1", kind: "piano", userId: "u1", accountId: null },
			now,
		);
		expect(made).toEqual({ code: "AbCd2345", expiresAt: null });
		expect(fake.values).not.toHaveBeenCalled();
	});
	test("a code that collides is drawn again; any other failure is thrown", async () => {
		fake.findFirst.mockResolvedValue(undefined);
		fake.values
			.mockRejectedValueOnce(new Error("UNIQUE constraint failed: short_link.code"))
			.mockResolvedValueOnce(undefined);
		const made = await mintShortLink(
			{ target: "/piano", kind: "piano", userId: null, accountId: null },
			now,
		);
		expect(made.code).toMatch(codeShape);
		expect(fake.values).toHaveBeenCalledTimes(2);
		expect(fake.values.mock.calls[0][0].code).not.toBe(fake.values.mock.calls[1][0].code);

		fake.values.mockReset().mockRejectedValue(new Error("database is locked"));
		await expect(
			mintShortLink({ target: "/piano", kind: "piano", userId: null, accountId: null }, now),
		).rejects.toThrow("database is locked");
		expect(fake.values).toHaveBeenCalledTimes(1);
	});
});

describe("resolveShortLink", () => {
	test("a live code answers its target and counts the hit after the response", async () => {
		fake.findFirst.mockResolvedValue({ id: "l1", target: "/piano?x=1#y", expiresAt: null });
		expect(await resolveShortLink("AbCd2345", now)).toEqual({ target: "/piano?x=1#y" });
		await Promise.all(fake.ran);
		expect(fake.where).toHaveBeenCalledTimes(1);
	});
	test("an expired code is gone; an unexpired one is not", async () => {
		fake.findFirst.mockResolvedValue({ id: "l1", target: "/piano", expiresAt: new Date(now - 1) });
		expect(await resolveShortLink("AbCd2345", now)).toBeNull();
		fake.findFirst.mockResolvedValue({ id: "l1", target: "/piano", expiresAt: new Date(now + 1) });
		expect(await resolveShortLink("AbCd2345", now)).toEqual({ target: "/piano" });
	});
	test("a code nobody made, or one not in the alphabet, is null without a query", async () => {
		fake.findFirst.mockResolvedValue(undefined);
		expect(await resolveShortLink("AbCd2345", now)).toBeNull();
		expect(fake.findFirst).toHaveBeenCalledTimes(1);
		expect(await resolveShortLink("AbCd0345", now)).toBeNull();
		expect(await resolveShortLink("x", now)).toBeNull();
		expect(fake.findFirst).toHaveBeenCalledTimes(1);
	});
});

describe("purgeExpiredShortLinks", () => {
	test("answers how many expired links went", async () => {
		fake.returning.mockResolvedValue([{ id: "a" }, { id: "b" }]);
		expect(await purgeExpiredShortLinks(new Date(now))).toBe(2);
	});
});
