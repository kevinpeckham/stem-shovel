import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	USER,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asOwnerOf,
	asSignedOut,
	asUser,
	asViewerOf,
	call,
	fakeId,
	httpError,
	redirected,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, email, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of the account remote functions: settings, invitations and
 * roles take an owner or admin of that account (403 for a member), a
 * member leaves on their own, anyone in an account may start another.
 */
const accounts = await import("./accounts.remote");

const INVITATION = fakeId("invite-one");
const CODE = fakeId("code-one");
const ARTIST = fakeId("artist-one");

beforeEach(resetRemoteMocks);

describe("owner-or-admin functions", () => {
	interface Case {
		name: string;
		fn: object;
		input: unknown;
		/** 404 where requireMember comes first (no membership to find), 401 where requireUser does. */
		anon: number;
		arrange?: () => unknown;
		dataFn: string;
		args: unknown[];
		outcome: Record<string, unknown>;
	}
	const cases: Case[] = [
		{
			name: "updateAccount",
			fn: accounts.updateAccount,
			input: { id: ACCOUNT, name: "Band", slug: "band" },
			anon: 401,
			arrange: () => data.updateAccount.mockResolvedValue({ ok: true, account: { slug: "band" } }),
			dataFn: "updateAccount",
			args: [ACCOUNT, { name: "Band", slug: "band" }],
			outcome: redirected("/band/settings"),
		},
		{
			name: "inviteMember",
			fn: accounts.inviteMember,
			input: { accountId: ACCOUNT, email: "new@example.com", role: "admin" },
			anon: 401,
			arrange: () =>
				data.createInvitation.mockResolvedValue({
					email: "new@example.com",
					token: "t".repeat(32),
					role: "admin",
				}),
			dataFn: "createInvitation",
			args: [ACCOUNT, USER, "new@example.com", "admin"],
			outcome: { sent: "new@example.com" },
		},
		{
			name: "createInviteCode",
			fn: accounts.createInviteCode,
			input: { accountId: ACCOUNT },
			anon: 401,
			arrange: () => data.createInviteCode.mockResolvedValue({ code: "ABCDEFGHJKMN" }),
			dataFn: "createInviteCode",
			args: [ACCOUNT, USER, { role: "member", note: "", maxUses: null, expiresDays: 0 }],
			outcome: { code: "ABCDEFGHJKMN" },
		},
		{
			name: "removeMember",
			fn: accounts.removeMember,
			input: { accountId: ACCOUNT, userId: OTHER_USER },
			anon: 401,
			arrange: () => {
				givenRow("accountMember", { role: "member" });
				data.removeMembership.mockResolvedValue({ ok: true });
			},
			dataFn: "removeMembership",
			args: [ACCOUNT, OTHER_USER],
			outcome: { removed: true },
		},
		{
			name: "setMemberRole",
			fn: accounts.setMemberRole,
			input: { accountId: ACCOUNT, userId: OTHER_USER, role: "member" },
			anon: 401,
			arrange: () => {
				givenRow("accountMember", { role: "member" });
				data.setMemberRole.mockResolvedValue({ ok: true });
			},
			dataFn: "setMemberRole",
			args: [ACCOUNT, OTHER_USER, "member"],
			outcome: { role: "member" },
		},
	];
	for (const c of cases) {
		const run = () => {
			c.arrange?.();
			return call(c.fn, c.input);
		};
		describe(c.name, () => {
			it(`${c.anon} signed out`, async () => {
				asSignedOut();
				await expect(run()).rejects.toMatchObject(httpError(c.anon));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("404 for a member of another account", async () => {
				asOutsider();
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("403 for a plain member", async () => {
				asEditorOf(ACCOUNT);
				await expect(run()).rejects.toMatchObject(httpError(403));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("an admin does it, scoped by the account", async () => {
				asAdminOf(ACCOUNT);
				if ("status" in c.outcome) await expect(run()).rejects.toMatchObject(c.outcome);
				else await expect(run()).resolves.toEqual(c.outcome);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
	it("inviteMember emails the invitation to the address", async () => {
		asOwnerOf(ACCOUNT);
		data.createInvitation.mockResolvedValue({
			email: "new@example.com",
			token: "t".repeat(32),
			role: "member",
		});
		await call(accounts.inviteMember, { accountId: ACCOUNT, email: "new@example.com" });
		expect(email.sendInvitationEmail).toHaveBeenCalledWith(
			expect.objectContaining({ to: "new@example.com", role: "member" }),
		);
	});
});

describe("removeMember's owner rules", () => {
	it("400 when removing oneself", async () => {
		asOwnerOf(ACCOUNT);
		await expect(
			call(accounts.removeMember, { accountId: ACCOUNT, userId: USER }),
		).rejects.toMatchObject(httpError(400));
	});
	it("403 when an admin removes an owner", async () => {
		asAdminOf(ACCOUNT);
		givenRow("accountMember", { role: "owner" });
		await expect(
			call(accounts.removeMember, { accountId: ACCOUNT, userId: OTHER_USER }),
		).rejects.toMatchObject(httpError(403));
		expect(data.removeMembership).not.toHaveBeenCalled();
	});
	it("an owner removes another owner", async () => {
		asOwnerOf(ACCOUNT);
		givenRow("accountMember", { role: "owner" });
		data.removeMembership.mockResolvedValue({ ok: true });
		await expect(
			call(accounts.removeMember, { accountId: ACCOUNT, userId: OTHER_USER }),
		).resolves.toEqual({ removed: true });
	});
});

describe("setMemberRole's owner rules", () => {
	const input = { accountId: ACCOUNT, userId: OTHER_USER, role: "admin" };
	it("403 when an admin grants admin or owner", async () => {
		asAdminOf(ACCOUNT);
		givenRow("accountMember", { role: "member" });
		await expect(call(accounts.setMemberRole, input)).rejects.toMatchObject(httpError(403));
		expect(data.setMemberRole).not.toHaveBeenCalled();
	});
	it("403 when an admin changes an owner", async () => {
		asAdminOf(ACCOUNT);
		givenRow("accountMember", { role: "owner" });
		await expect(call(accounts.setMemberRole, { ...input, role: "member" })).rejects.toMatchObject(
			httpError(403),
		);
	});
	it("an owner grants admin", async () => {
		asOwnerOf(ACCOUNT);
		givenRow("accountMember", { role: "member" });
		data.setMemberRole.mockResolvedValue({ ok: true });
		await expect(call(accounts.setMemberRole, input)).resolves.toEqual({ role: "admin" });
		expect(data.setMemberRole).toHaveBeenCalledWith(ACCOUNT, OTHER_USER, "admin");
	});
});

describe("revokeInvitation and revokeInviteCode (searched across the caller's admin accounts)", () => {
	const cases = [
		{
			name: "revokeInvitation",
			fn: accounts.revokeInvitation,
			dataFn: "revokeInvitation",
			id: INVITATION,
		},
		{
			name: "revokeInviteCode",
			fn: accounts.revokeInviteCode,
			dataFn: "revokeInviteCode",
			id: CODE,
		},
	];
	for (const c of cases) {
		describe(c.name, () => {
			it("refused signed out, nothing searched", async () => {
				asSignedOut();
				// 401 from requireMember; 404 when the record's lookup comes first and the fake holds no row.
				const status = await call(c.fn, { id: c.id }).then(
					() => 0,
					(e: { status: number }) => e.status,
				);
				expect([401, 404]).toContain(status);
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("404 for a plain member, their account not even searched", async () => {
				asEditorOf(ACCOUNT);
				data[c.dataFn].mockResolvedValue(true);
				await expect(call(c.fn, { id: c.id })).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("an admin revokes it within their account", async () => {
				asAdminOf(ACCOUNT);
				data[c.dataFn].mockResolvedValue(true);
				await expect(call(c.fn, { id: c.id })).resolves.toEqual({ revoked: true });
				expect(data[c.dataFn]).toHaveBeenCalledWith(ACCOUNT, c.id);
			});
			it("404 when it belongs to no account of theirs", async () => {
				asAdminOf(ACCOUNT);
				data[c.dataFn].mockResolvedValue(false);
				await expect(call(c.fn, { id: c.id })).rejects.toMatchObject(httpError(404));
			});
		});
	}
});

describe("acceptInvitation", () => {
	const input = { token: "t".repeat(32) };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(accounts.acceptInvitation, input)).rejects.toMatchObject(httpError(401));
	});
	it("the signed-in user joins as themselves and lands on the account", async () => {
		asUser();
		data.acceptInvitation.mockResolvedValue({
			account: { id: ACCOUNT, slug: "band" },
			project: null,
		});
		await expect(call(accounts.acceptInvitation, input)).rejects.toMatchObject(
			redirected("/band/projects"),
		);
		expect(data.acceptInvitation).toHaveBeenCalledWith(
			"t".repeat(32),
			expect.objectContaining({ id: USER }),
		);
	});
	it("400 for a mismatched address", async () => {
		asUser();
		data.acceptInvitation.mockResolvedValue("mismatch");
		await expect(call(accounts.acceptInvitation, input)).rejects.toMatchObject(httpError(400));
	});
});

describe("leaveAccount", () => {
	const input = { accountId: ACCOUNT };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(accounts.leaveAccount, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for someone not in the account", async () => {
		asOutsider();
		await expect(call(accounts.leaveAccount, input)).rejects.toMatchObject(httpError(404));
		expect(data.removeMembership).not.toHaveBeenCalled();
	});
	it("a member removes their own membership only", async () => {
		asEditorOf(ACCOUNT);
		data.removeMembership.mockResolvedValue({ ok: true });
		await expect(call(accounts.leaveAccount, input)).rejects.toMatchObject(redirected("/accounts"));
		expect(data.removeMembership).toHaveBeenCalledWith(ACCOUNT, USER);
	});
});

describe("createAccount", () => {
	const input = { name: "Solo" };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(accounts.createAccount, input)).rejects.toMatchObject(httpError(401));
	});
	it("403 for a user in no account yet", async () => {
		asUser();
		await expect(call(accounts.createAccount, input)).rejects.toMatchObject(httpError(403));
		expect(data.createOwnedAccount).not.toHaveBeenCalled();
	});
	it("a member of any account starts one of their own", async () => {
		asViewerOf(ACCOUNT);
		data.createOwnedAccount.mockResolvedValue({ id: fakeId("acct-new"), slug: "solo" });
		await expect(call(accounts.createAccount, input)).rejects.toMatchObject(
			redirected("/solo/projects"),
		);
		expect(data.createOwnedAccount).toHaveBeenCalledWith(USER, "Solo");
	});
});

describe("setDefaultArtist", () => {
	const input = { accountId: ACCOUNT, artistId: ARTIST };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(accounts.setDefaultArtist, input)).rejects.toMatchObject(httpError(401));
	});
	it("404 for a viewer", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(accounts.setDefaultArtist, input)).rejects.toMatchObject(httpError(404));
		expect(data.setAccountDefaultArtist).not.toHaveBeenCalled();
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(accounts.setDefaultArtist, input)).rejects.toMatchObject(httpError(404));
	});
	it("an editor sets it, scoped by the account; empty clears it", async () => {
		asEditorOf(ACCOUNT);
		data.setAccountDefaultArtist.mockResolvedValue(true);
		await expect(call(accounts.setDefaultArtist, input)).resolves.toEqual({ artistId: ARTIST });
		expect(data.setAccountDefaultArtist).toHaveBeenCalledWith(ACCOUNT, ARTIST);
		await call(accounts.setDefaultArtist, { accountId: ACCOUNT, artistId: "" });
		expect(data.setAccountDefaultArtist).toHaveBeenLastCalledWith(ACCOUNT, null);
	});
});
