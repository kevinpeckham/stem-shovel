import { beforeEach, describe, expect, it, vi } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	asSignedOut,
	asUser,
	call,
	currentEvent,
	redirected,
} from "../../../tests/helpers/fakeRequestEvent";
import { resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** signOut ends the session behind the request's own cookies and lands on the front page, whatever Better Auth says. */
const remote = await import("./auth.remote");
const { auth } = await import("$lib/auth");

beforeEach(resetRemoteMocks);

describe("signOut", () => {
	it("signs the request's session out and redirects home", async () => {
		asUser();
		await expect(call(remote.signOut)).rejects.toMatchObject(redirected("/"));
		expect(auth.api.signOut).toHaveBeenCalledWith({ headers: currentEvent().request.headers });
	});
	it("still lands home when there was no session to end", async () => {
		asSignedOut();
		vi.mocked(auth.api.signOut).mockRejectedValue(new Error("no session"));
		await expect(call(remote.signOut)).rejects.toMatchObject(redirected("/"));
	});
});
