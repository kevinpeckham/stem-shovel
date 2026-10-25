import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

const fake = vi.hoisted(() => ({
	findFirst: vi.fn(),
	findMany: vi.fn(),
	values: vi.fn(),
	set: vi.fn(),
	deleteWhere: vi.fn(),
	where: vi.fn(),
	returning: vi.fn(),
	ran: [] as Promise<void>[],
}));
vi.mock("#lib/server/db/index.js", () => ({
	db: {
		query: { shortLink: { findFirst: fake.findFirst, findMany: fake.findMany } },
		insert: () => ({ values: fake.values }),
		update: () => ({
			set: (values: unknown) => {
				fake.set(values);
				return { where: fake.where };
			},
		}),
		// Awaited directly (a revoke) or through .returning() (the purge).
		delete: () => ({
			where: (...args: unknown[]) => {
				fake.deleteWhere(...args);
				return Object.assign(Promise.resolve(), { returning: fake.returning });
			},
		}),
	},
}));
vi.mock("#lib/server/background.js", () => ({
	background: (work: () => Promise<void>) => {
		fake.ran.push(work());
	},
}));

const {
	listShortLinksOf,
	mintShortLink,
	purgeExpiredShortLinks,
	resolveShortLink,
	revokeShortLink,
	setShortLinkSlug,
} = await import("./shortLinks");

const DAY = 86_400_000;
const now = Date.UTC(2026, 9, 6, 12);
const codeShape = /^[23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz]{8}$/;

beforeEach(() => {
	fake.findFirst.mockReset();
	fake.findMany.mockReset();
	fake.set.mockReset();
	fake.deleteWhere.mockReset();
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
	test("a code nobody made is null; a malformed or reserved address is null without a query", async () => {
		fake.findFirst.mockResolvedValue(undefined);
		expect(await resolveShortLink("abcd2345", now)).toBeNull();
		expect(fake.findFirst).toHaveBeenCalledTimes(1);
		for (const bad of ["x", "ab", "a/b", "-abc", "piano", "Admin"])
			expect(await resolveShortLink(bad, now)).toBeNull();
		expect(fake.findFirst).toHaveBeenCalledTimes(1);
	});
	test("a code is matched exactly, so a code that misses in its own case is not lowered into a slug's", async () => {
		fake.findFirst.mockResolvedValueOnce({ id: "l1", target: "/piano", expiresAt: null });
		expect(await resolveShortLink("AbCd2345", now)).toEqual({ target: "/piano" });
		expect(fake.findFirst).toHaveBeenCalledTimes(1);
	});
	test("a custom address typed with capitals is found lowered after the exact miss", async () => {
		fake.findFirst
			.mockResolvedValueOnce(undefined)
			.mockResolvedValueOnce({ id: "l1", target: "/chord-player#k=C", expiresAt: null });
		expect(await resolveShortLink("My-Band", now)).toEqual({ target: "/chord-player#k=C" });
		expect(fake.findFirst).toHaveBeenCalledTimes(2);
	});
	test("a lowercase address that misses is not looked up twice", async () => {
		fake.findFirst.mockResolvedValue(undefined);
		expect(await resolveShortLink("my-band", now)).toBeNull();
		expect(fake.findFirst).toHaveBeenCalledTimes(1);
	});
});

describe("listShortLinksOf", () => {
	test("answers the user's links as the query returns them", async () => {
		const rows = [{ id: "l2" }, { id: "l1" }];
		fake.findMany.mockResolvedValue(rows);
		expect(await listShortLinksOf("u1")).toBe(rows);
		expect(fake.findMany).toHaveBeenCalledTimes(1);
	});
});

describe("revokeShortLink", () => {
	test("the creator's link is deleted", async () => {
		fake.findFirst.mockResolvedValue({ createdBy: "u1" });
		expect(await revokeShortLink("l1", "u1")).toBe("revoked");
		expect(fake.deleteWhere).toHaveBeenCalledTimes(1);
	});
	test("someone else's link, or an anonymous one, is forbidden and stays", async () => {
		fake.findFirst.mockResolvedValue({ createdBy: "u2" });
		expect(await revokeShortLink("l1", "u1")).toBe("forbidden");
		fake.findFirst.mockResolvedValue({ createdBy: null });
		expect(await revokeShortLink("l1", "u1")).toBe("forbidden");
		expect(fake.deleteWhere).not.toHaveBeenCalled();
	});
	test("a link that is gone is missing", async () => {
		fake.findFirst.mockResolvedValue(undefined);
		expect(await revokeShortLink("l1", "u1")).toBe("missing");
	});
});

describe("setShortLinkSlug", () => {
	test("the creator's link takes the slug as its code", async () => {
		fake.findFirst.mockResolvedValueOnce({ createdBy: "u1" }).mockResolvedValueOnce(undefined);
		expect(await setShortLinkSlug("l1", "u1", "my-band")).toBe("saved");
		expect(fake.set).toHaveBeenCalledWith({ code: "my-band" });
	});
	test("a slug another link holds is taken, found first or caught from the unique index", async () => {
		fake.findFirst.mockResolvedValueOnce({ createdBy: "u1" }).mockResolvedValueOnce({ id: "l9" });
		expect(await setShortLinkSlug("l1", "u1", "my-band")).toBe("taken");
		expect(fake.set).not.toHaveBeenCalled();

		fake.findFirst.mockResolvedValueOnce({ createdBy: "u1" }).mockResolvedValueOnce(undefined);
		fake.where.mockRejectedValueOnce(new Error("UNIQUE constraint failed: short_link.code"));
		expect(await setShortLinkSlug("l1", "u1", "my-band")).toBe("taken");

		fake.findFirst.mockResolvedValueOnce({ createdBy: "u1" }).mockResolvedValueOnce(undefined);
		fake.where.mockRejectedValueOnce(new Error("database is locked"));
		await expect(setShortLinkSlug("l1", "u1", "my-band")).rejects.toThrow("database is locked");
	});
	test("someone else's link is forbidden; a gone one is missing", async () => {
		fake.findFirst.mockResolvedValue({ createdBy: "u2" });
		expect(await setShortLinkSlug("l1", "u1", "my-band")).toBe("forbidden");
		fake.findFirst.mockResolvedValue(undefined);
		expect(await setShortLinkSlug("l1", "u1", "my-band")).toBe("missing");
		expect(fake.set).not.toHaveBeenCalled();
	});
});

describe("purgeExpiredShortLinks", () => {
	test("answers how many expired links went", async () => {
		fake.returning.mockResolvedValue([{ id: "a" }, { id: "b" }]);
		expect(await purgeExpiredShortLinks(new Date(now))).toBe(2);
	});
});
