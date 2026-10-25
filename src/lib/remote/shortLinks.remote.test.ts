import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asMemberOf,
	asSignedOut,
	call,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import {
	rateLimited,
	resetRemoteMocks,
	shortLinks,
} from "../../../tests/helpers/fakeServerModules";

/**
 * mintShortLink is open to everyone (the instruments work signed out); what
 * it must get right is whose link it is: the user when signed in, and the
 * account only when the minter really belongs to the one in the path.
 */
const remote = await import("./shortLinks.remote");

beforeEach(() => {
	resetRemoteMocks();
	shortLinks.mintShortLink.mockResolvedValue({ code: "ABCDEFGH" });
});

describe("mintShortLink", () => {
	it("a visitor mints an instrument link, limited by address, filed under nobody", async () => {
		asSignedOut();
		await expect(
			call(remote.mintShortLink, { target: "/piano#abc", kind: "piano" }),
		).resolves.toEqual({ code: "ABCDEFGH", url: "http://localhost/x/ABCDEFGH" });
		expect(rateLimited).toHaveBeenCalledWith("short-link:ip:203.0.113.7", 30, 600_000);
		expect(shortLinks.mintShortLink).toHaveBeenCalledWith({
			target: "/piano#abc",
			kind: "piano",
			userId: null,
			accountId: null,
		});
	});
	it("a signed-in user's link is theirs, limited per user", async () => {
		asEditorOf(ACCOUNT);
		await call(remote.mintShortLink, { target: "/drum-machine?b=1", kind: "drum-machine" });
		expect(rateLimited).toHaveBeenCalledWith(`short-link:user:${USER}`, 120, 600_000);
		expect(shortLinks.mintShortLink).toHaveBeenCalledWith(
			expect.objectContaining({ userId: USER, accountId: null }),
		);
	});
	it("a song link in the minter's own account is filed under that account", async () => {
		asEditorOf(ACCOUNT);
		await call(remote.mintShortLink, {
			target: "/slug-acct-one/projects/album/track",
			kind: "song",
		});
		expect(shortLinks.mintShortLink).toHaveBeenCalledWith(
			expect.objectContaining({ userId: USER, accountId: ACCOUNT }),
		);
	});
	it("a song link in an account the minter does not belong to is filed under none", async () => {
		asEditorOf(ACCOUNT);
		await call(remote.mintShortLink, {
			target: "/other-band/projects/album/track",
			kind: "project",
		});
		expect(shortLinks.mintShortLink).toHaveBeenCalledWith(
			expect.objectContaining({ userId: USER, accountId: null }),
		);
	});
	it("a super admin acting as owner does not file the link under that account", async () => {
		asMemberOf(ACCOUNT, "owner", { actingAs: true });
		await call(remote.mintShortLink, {
			target: "/slug-acct-one/projects/album/track",
			kind: "song",
		});
		expect(shortLinks.mintShortLink).toHaveBeenCalledWith(
			expect.objectContaining({ accountId: null }),
		);
	});
	it("429 once the limiter says so, minting nothing", async () => {
		asSignedOut();
		rateLimited.mockResolvedValue(true);
		await expect(
			call(remote.mintShortLink, { target: "/piano", kind: "piano" }),
		).rejects.toMatchObject(httpError(429));
		expect(shortLinks.mintShortLink).not.toHaveBeenCalled();
	});
	it("refuses a target off this site before anything else", async () => {
		asSignedOut();
		await expect(
			call(remote.mintShortLink, { target: "https://evil.example/", kind: "other" }),
		).rejects.toThrow();
		expect(shortLinks.mintShortLink).not.toHaveBeenCalled();
	});
});

const LINK = "l".repeat(21);

describe("revokeShortLink", () => {
	it("a signed-in user revokes their own link", async () => {
		asEditorOf(ACCOUNT);
		shortLinks.revokeShortLink.mockResolvedValue("revoked");
		await expect(call(remote.revokeShortLink, { id: LINK })).resolves.toEqual({ revoked: LINK });
		expect(shortLinks.revokeShortLink).toHaveBeenCalledWith(LINK, USER);
	});
	it("someone else's link is a 403, a gone one a 404", async () => {
		asEditorOf(ACCOUNT);
		shortLinks.revokeShortLink.mockResolvedValue("forbidden");
		await expect(call(remote.revokeShortLink, { id: LINK })).rejects.toMatchObject(httpError(403));
		shortLinks.revokeShortLink.mockResolvedValue("missing");
		await expect(call(remote.revokeShortLink, { id: LINK })).rejects.toMatchObject(httpError(404));
	});
	it("a visitor is a 401 before anything is touched", async () => {
		asSignedOut();
		await expect(call(remote.revokeShortLink, { id: LINK })).rejects.toMatchObject(httpError(401));
		expect(shortLinks.revokeShortLink).not.toHaveBeenCalled();
	});
});

describe("setShortLinkSlug", () => {
	it("saves the lowered slug for the user's own link, limited per user", async () => {
		asEditorOf(ACCOUNT);
		shortLinks.setShortLinkSlug.mockResolvedValue("saved");
		await expect(call(remote.setShortLinkSlug, { linkId: LINK, slug: "My-Band" })).resolves.toEqual(
			{ slug: "my-band" },
		);
		expect(rateLimited).toHaveBeenCalledWith(`short-link-slug:user:${USER}`, 30, 600_000);
		expect(shortLinks.setShortLinkSlug).toHaveBeenCalledWith(LINK, USER, "my-band");
	});
	it("a taken slug goes back to the slug field", async () => {
		asEditorOf(ACCOUNT);
		shortLinks.setShortLinkSlug.mockResolvedValue("taken");
		await expect(
			call(remote.setShortLinkSlug, { linkId: LINK, slug: "my-band" }),
		).rejects.toMatchObject({
			issues: [{ path: ["slug"], message: "Another link already has that address." }],
		});
	});
	it("a reserved or malformed slug is refused before the server module", async () => {
		asEditorOf(ACCOUNT);
		for (const slug of ["admin", "ab", "-tour", "my band"])
			await expect(call(remote.setShortLinkSlug, { linkId: LINK, slug })).rejects.toThrow();
		expect(shortLinks.setShortLinkSlug).not.toHaveBeenCalled();
	});
	it("someone else's link is a 403; a visitor a 401; past the limit a 429", async () => {
		asEditorOf(ACCOUNT);
		shortLinks.setShortLinkSlug.mockResolvedValue("forbidden");
		await expect(
			call(remote.setShortLinkSlug, { linkId: LINK, slug: "my-band" }),
		).rejects.toMatchObject(httpError(403));
		rateLimited.mockResolvedValue(true);
		await expect(
			call(remote.setShortLinkSlug, { linkId: LINK, slug: "my-band" }),
		).rejects.toMatchObject(httpError(429));
		asSignedOut();
		await expect(
			call(remote.setShortLinkSlug, { linkId: LINK, slug: "my-band" }),
		).rejects.toMatchObject(httpError(401));
	});
});
