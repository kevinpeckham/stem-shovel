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
	asViewerOf,
	call,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** Who may edit a member's profile (docs/band-plan.md, "The band directory"): the member, or an owner or admin. */
const profiles = await import("./memberProfiles.remote");

const FIELDS = { phone: "555-0100", instruments: "guitar, vocals", notes: "" };
const ROW = { userId: USER, name: "One", email: "one@example.com", role: "member", ...FIELDS };
const own = { accountId: ACCOUNT, userId: USER, ...FIELDS };
const theirs = { ...own, userId: OTHER_USER };

beforeEach(() => {
	resetRemoteMocks();
	data.updateMemberProfile.mockResolvedValue(ROW);
});

describe("updateMemberProfile", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(profiles.updateMemberProfile, own)).rejects.toMatchObject(httpError(401));
		expect(data.updateMemberProfile).not.toHaveBeenCalled();
	});
	it("404 for a member of another account", async () => {
		asOutsider();
		await expect(call(profiles.updateMemberProfile, theirs)).rejects.toMatchObject(httpError(404));
		expect(data.updateMemberProfile).not.toHaveBeenCalled();
	});
	it("a member edits their own profile", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(profiles.updateMemberProfile, own)).resolves.toEqual({ ok: true });
		expect(data.updateMemberProfile).toHaveBeenCalledWith(ACCOUNT, USER, FIELDS);
	});
	it("a viewer edits their own profile too", async () => {
		asViewerOf(ACCOUNT);
		await expect(call(profiles.updateMemberProfile, own)).resolves.toEqual({ ok: true });
	});
	it("403 for another member's profile, as a member or a viewer", async () => {
		for (const as of [() => asEditorOf(ACCOUNT), () => asViewerOf(ACCOUNT)]) {
			as();
			await expect(call(profiles.updateMemberProfile, theirs)).rejects.toMatchObject({
				status: 403,
				body: { message: "Only the member or an admin may edit this profile." },
			});
		}
		expect(data.updateMemberProfile).not.toHaveBeenCalled();
	});
	it("an admin or an owner edits anyone's", async () => {
		for (const as of [() => asAdminOf(ACCOUNT), () => asOwnerOf(ACCOUNT)]) {
			as();
			await expect(call(profiles.updateMemberProfile, theirs)).resolves.toEqual({ ok: true });
			expect(data.updateMemberProfile).toHaveBeenLastCalledWith(ACCOUNT, OTHER_USER, FIELDS);
		}
	});
	it("404 when the user is not a member of the account", async () => {
		asAdminOf(ACCOUNT);
		data.updateMemberProfile.mockResolvedValue(null);
		await expect(call(profiles.updateMemberProfile, theirs)).rejects.toMatchObject(httpError(404));
	});
});
