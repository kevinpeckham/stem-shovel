import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	OTHER_USER,
	asOwnerOf,
	asSignedOut,
	asSuperAdmin,
	asSystemAdmin,
	asUser,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/**
 * Authorization of /admin's remote functions: a system admin only, and a
 * 404 for everyone else so the pages are not advertised; founder status
 * takes a super admin on top.
 */
const admin = await import("./admin.remote");

const SYSADMIN = fakeId("sysadmin");
const SONG = fakeId("song-one");
const CODE = fakeId("code-one");
const ENTRY = fakeId("wait-one");

interface Case {
	name: string;
	fn: object;
	input: unknown;
	arrange?: () => unknown;
	dataFn: string;
	args: unknown[];
	outcome: unknown;
}

beforeEach(resetRemoteMocks);

const cases: Case[] = [
	{
		name: "createSystemInviteCode",
		fn: admin.createSystemInviteCode,
		input: { note: "beta" },
		arrange: () => data.createInviteCode.mockResolvedValue({ code: "ABCDEFGHJKMN" }),
		dataFn: "createInviteCode",
		args: [null, SYSADMIN, { role: "member", note: "beta", maxUses: null, expiresDays: 0 }],
		outcome: { code: "ABCDEFGHJKMN" },
	},
	{
		name: "revokeSystemInviteCode",
		fn: admin.revokeSystemInviteCode,
		input: { id: CODE },
		arrange: () => data.revokeInviteCode.mockResolvedValue(true),
		dataFn: "revokeInviteCode",
		args: [null, CODE],
		outcome: { revoked: true },
	},
	{
		name: "manageUser (suspend)",
		fn: admin.manageUser,
		input: { id: OTHER_USER, action: "suspend" },
		arrange: () => data.setUserActive.mockResolvedValue(true),
		dataFn: "setUserActive",
		args: [OTHER_USER, false],
		outcome: { action: "suspend", accountsRemoved: 0 },
	},
	{
		name: "manageUser (delete)",
		fn: admin.manageUser,
		input: { id: OTHER_USER, action: "delete" },
		arrange: () => data.deleteUser.mockResolvedValue({ accountsRemoved: 1 }),
		dataFn: "deleteUser",
		args: [OTHER_USER],
		outcome: { action: "delete", accountsRemoved: 1 },
	},
	{
		name: "manageAccount (suspend)",
		fn: admin.manageAccount,
		input: { id: ACCOUNT, action: "suspend" },
		arrange: () => data.setAccountStatus.mockResolvedValue(true),
		dataFn: "setAccountStatus",
		args: [ACCOUNT, "suspended"],
		outcome: { action: "suspend" },
	},
	{
		name: "manageAccount (delete)",
		fn: admin.manageAccount,
		input: { id: ACCOUNT, action: "delete" },
		arrange: () => data.deleteAccount.mockResolvedValue(true),
		dataFn: "deleteAccount",
		args: [ACCOUNT],
		outcome: { action: "delete" },
	},
	{
		name: "setStorageLimit",
		fn: admin.setStorageLimit,
		input: { id: ACCOUNT, gigabytes: "2" },
		arrange: () => data.setAccountStorageLimit.mockResolvedValue(true),
		dataFn: "setAccountStorageLimit",
		args: [ACCOUNT, 2 * 1024 ** 3],
		outcome: { gigabytes: 2 },
	},
	{
		name: "setSignUpModeForm",
		fn: admin.setSignUpModeForm,
		input: { mode: "open" },
		dataFn: "setSignUpMode",
		args: ["open"],
		outcome: { mode: "open" },
	},
	{
		name: "setFeaturedSong",
		fn: admin.setFeaturedSong,
		input: { songId: SONG },
		arrange: () => data.listPublicSongs.mockResolvedValue([{ id: SONG }]),
		dataFn: "setAppSetting",
		args: ["featuredSongId", SONG],
		outcome: { saved: true },
	},
	{
		name: "clearHomeBeat",
		fn: admin.clearHomeBeat,
		input: {},
		dataFn: "deleteAppSetting",
		args: ["homeBeat"],
		outcome: { cleared: true },
	},
	{
		name: "clearSitePianoPreset",
		fn: admin.clearSitePianoPreset,
		input: { slot: 2, instrument: "chords" },
		dataFn: "setSitePianoPreset",
		args: [2, null, "chords"],
		outcome: { cleared: true },
	},
	{
		name: "manageWaitlist (remove)",
		fn: admin.manageWaitlist,
		input: { id: ENTRY, action: "remove" },
		arrange: () =>
			data.waitlistById.mockResolvedValue({ id: ENTRY, status: "confirmed", email: "w@x.io" }),
		dataFn: "removeWaitlist",
		args: [ENTRY],
		outcome: { action: "remove" },
	},
];

for (const c of cases) {
	const run = () => {
		c.arrange?.();
		return call(c.fn, c.input);
	};
	describe(c.name, () => {
		it("404 signed out", async () => {
			asSignedOut();
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for a signed-in user", async () => {
			asUser();
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("404 for an account owner who is not the operator", async () => {
			asOwnerOf(ACCOUNT);
			await expect(run()).rejects.toMatchObject(httpError(404));
			expect(data[c.dataFn]).not.toHaveBeenCalled();
		});
		it("the system admin does it", async () => {
			asSystemAdmin();
			await expect(run()).resolves.toEqual(c.outcome);
			expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
		});
	});
}

describe("founder status (super admins only)", () => {
	it("manageUser founder: 404 for a system admin who is not a super admin", async () => {
		asSystemAdmin();
		await expect(
			call(admin.manageUser, { id: OTHER_USER, action: "founder" }),
		).rejects.toMatchObject(httpError(404));
		expect(data.setUserFounder).not.toHaveBeenCalled();
	});
	it("manageUser founder: a super admin flags every account the user owns", async () => {
		asSuperAdmin();
		data.setUserFounder.mockResolvedValue(2);
		await expect(call(admin.manageUser, { id: OTHER_USER, action: "unfounder" })).resolves.toEqual({
			action: "unfounder",
			accountsRemoved: 0,
			accounts: 2,
		});
		expect(data.setUserFounder).toHaveBeenCalledWith(OTHER_USER, false);
	});
	it("manageAccount founder: 404 for a system admin who is not a super admin", async () => {
		asSystemAdmin();
		await expect(
			call(admin.manageAccount, { id: ACCOUNT, action: "founder" }),
		).rejects.toMatchObject(httpError(404));
		expect(data.setAccountFounder).not.toHaveBeenCalled();
	});
	it("manageAccount founder: a super admin grants it", async () => {
		asSuperAdmin();
		data.setAccountFounder.mockResolvedValue(true);
		await expect(call(admin.manageAccount, { id: ACCOUNT, action: "founder" })).resolves.toEqual({
			action: "founder",
		});
		expect(data.setAccountFounder).toHaveBeenCalledWith(ACCOUNT, true);
	});
});

describe("manageUser guards", () => {
	it("400 when the admin targets their own user", async () => {
		asSystemAdmin();
		await expect(call(admin.manageUser, { id: SYSADMIN, action: "delete" })).rejects.toMatchObject(
			httpError(400),
		);
		expect(data.deleteUser).not.toHaveBeenCalled();
	});
});

describe("setFeaturedSong", () => {
	it("400 for a song that is not public", async () => {
		asSystemAdmin();
		data.listPublicSongs.mockResolvedValue([]);
		await expect(call(admin.setFeaturedSong, { songId: SONG })).rejects.toMatchObject(
			httpError(400),
		);
		expect(data.setAppSetting).not.toHaveBeenCalled();
	});
});
