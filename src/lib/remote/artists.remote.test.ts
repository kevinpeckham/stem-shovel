import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asAdminOf,
	asEditorOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	call,
	fakeId,
	httpError,
	redirected,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, email, givenRow, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Authorization of the artist directory: editors edit (memberOf), and inviting someone in follows the account's rule (owners and admins). */
const artists = await import("./artists.remote");

const ARTIST = fakeId("artist-one");
const MEMBER = fakeId("person-one");

beforeEach(() => {
	resetRemoteMocks();
	givenRow("artist", { accountId: ACCOUNT });
	givenRow("artistMember", { artist: { accountId: ACCOUNT } });
});

describe("editor-gated functions", () => {
	interface Case {
		name: string;
		fn: object;
		input: unknown;
		arrange: () => unknown;
		dataFn: string;
		args: unknown[];
		outcome: Record<string, unknown>;
	}
	const cases: Case[] = [
		{
			name: "updateArtist",
			fn: artists.updateArtist,
			input: { id: ARTIST, name: "Ann" },
			arrange: () => data.updateArtist.mockResolvedValue(true),
			dataFn: "updateArtist",
			args: [ACCOUNT, ARTIST, expect.objectContaining({ name: "Ann" })],
			outcome: { saved: true },
		},
		{
			name: "deleteArtist",
			fn: artists.deleteArtist,
			input: { id: ARTIST },
			arrange: () => data.deleteArtist.mockResolvedValue(true),
			dataFn: "deleteArtist",
			args: [ACCOUNT, ARTIST],
			outcome: redirected("/slug-acct-one/artists"),
		},
		{
			name: "addArtistMember",
			fn: artists.addArtistMember,
			input: { artistId: ARTIST, name: "Bo" },
			arrange: () => data.addArtistMember.mockResolvedValue({ id: MEMBER }),
			dataFn: "addArtistMember",
			args: [ACCOUNT, ARTIST, expect.objectContaining({ name: "Bo" })],
			outcome: { added: MEMBER },
		},
		{
			name: "removeArtistMember",
			fn: artists.removeArtistMember,
			input: { id: MEMBER },
			arrange: () => data.removeArtistMember.mockResolvedValue(true),
			dataFn: "removeArtistMember",
			args: [ACCOUNT, MEMBER],
			outcome: { removed: true },
		},
	];
	for (const c of cases) {
		const run = () => {
			c.arrange();
			return call(c.fn, c.input);
		};
		describe(c.name, () => {
			it("404 signed out", async () => {
				asSignedOut();
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("404 for a member of another account", async () => {
				asOutsider();
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("404 for a viewer", async () => {
				asViewerOf(ACCOUNT);
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data[c.dataFn]).not.toHaveBeenCalled();
			});
			it("an editor reaches the data layer scoped by the artist's account", async () => {
				asEditorOf(ACCOUNT);
				if ("status" in c.outcome) await expect(run()).rejects.toMatchObject(c.outcome);
				else await expect(run()).resolves.toEqual(c.outcome);
				expect(data[c.dataFn]).toHaveBeenCalledWith(...c.args);
			});
		});
	}
});

describe("inviteArtistMember and inviteArtist (owners and admins)", () => {
	const cases = [
		{
			name: "inviteArtistMember",
			fn: artists.inviteArtistMember,
			input: { id: MEMBER },
			arrange: () =>
				data.artistMemberById.mockResolvedValue({
					email: "person@example.com",
					artist: { accountId: ACCOUNT },
				}),
			to: "person@example.com",
		},
		{
			name: "inviteArtist",
			fn: artists.inviteArtist,
			input: { id: ARTIST, role: "admin" },
			arrange: () =>
				data.artistById.mockResolvedValue({ accountId: ACCOUNT, email: "ann@example.com" }),
			to: "ann@example.com",
		},
	];
	for (const c of cases) {
		const run = () => {
			c.arrange();
			data.createInvitation.mockResolvedValue({
				email: c.to,
				token: "t".repeat(32),
				role: "member",
			});
			return call(c.fn, c.input);
		};
		describe(c.name, () => {
			it("401 signed out", async () => {
				asSignedOut();
				await expect(run()).rejects.toMatchObject(httpError(401));
			});
			it("404 for a member of another account", async () => {
				asOutsider();
				await expect(run()).rejects.toMatchObject(httpError(404));
				expect(data.createInvitation).not.toHaveBeenCalled();
			});
			it("403 for a plain member", async () => {
				asEditorOf(ACCOUNT);
				await expect(run()).rejects.toMatchObject(httpError(403));
				expect(data.createInvitation).not.toHaveBeenCalled();
			});
			it("an admin invites the recorded address into the account", async () => {
				asAdminOf(ACCOUNT);
				await expect(run()).resolves.toEqual({ sent: true, email: c.to });
				expect(data.createInvitation).toHaveBeenCalledWith(ACCOUNT, USER, c.to, expect.any(String));
				expect(email.sendInvitationEmail).toHaveBeenCalledWith(
					expect.objectContaining({ to: c.to }),
				);
			});
		});
	}
});
