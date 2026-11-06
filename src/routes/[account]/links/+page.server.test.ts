import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	asMemberOf,
	asOutsider,
	asSignedOut,
	asViewerOf,
	currentEvent,
	httpError,
	redirected,
} from "../../../../tests/helpers/fakeRequestEvent";
import { data, resetRemoteMocks } from "../../../../tests/helpers/fakeServerModules";

/** The account's Viewing links page: members (a viewer too) see every link; anyone else is turned away. */
const { load } = await import("./+page.server");

const LINKS = [{ id: "link-1", code: "ABCD2345", state: "open", kind: "song" }];

const run = () =>
	load({
		parent: async () => ({
			account: { id: ACCOUNT, slug: "acct", name: "Account" },
			canEdit: true,
		}),
		locals: currentEvent().locals,
		url: new URL("http://localhost/acct/links"),
	} as never);

beforeEach(() => {
	resetRemoteMocks();
	data.listAccountShareLinks.mockResolvedValue(LINKS);
});

describe("/[account]/links load", () => {
	it("sends a signed-out visitor to sign in", async () => {
		asSignedOut();
		await expect(run()).rejects.toMatchObject({
			...redirected(),
			location: "/sign-in?next=%2Facct%2Flinks",
		});
		expect(data.listAccountShareLinks).not.toHaveBeenCalled();
	});

	it("turns away someone from another account", async () => {
		asOutsider();
		await expect(run()).rejects.toMatchObject(httpError(404));
		expect(data.listAccountShareLinks).not.toHaveBeenCalled();
	});

	it("gives a member the list, read with the account's id and slug", async () => {
		asMemberOf(ACCOUNT);
		await expect(run()).resolves.toEqual({ links: LINKS });
		expect(data.listAccountShareLinks).toHaveBeenCalledWith(ACCOUNT, "acct");
	});

	it("gives a viewer the list too", async () => {
		asViewerOf(ACCOUNT);
		await expect(run()).resolves.toEqual({ links: LINKS });
	});
});
