import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	asSignedOut,
	asUser,
	call,
	fakeUser,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import { background, email, resetRemoteMocks } from "../../../tests/helpers/fakeServerModules";

/** The "your security settings changed" mails go to the signed-in caller's own address, never to one from the request. */
const security = await import("./security.remote");

beforeEach(resetRemoteMocks);

/** Runs what the handler queued for after the response. */
const flushBackground = () =>
	Promise.all(background.mock.calls.map(([work]) => (work as () => Promise<void>)()));

describe("notifyTwoFactorChanged", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(security.notifyTwoFactorChanged, { enabled: true })).rejects.toMatchObject(
			httpError(401),
		);
		expect(background).not.toHaveBeenCalled();
	});
	it("mails the caller", async () => {
		asUser(fakeUser(undefined, { email: "me@example.com", name: "Me" }));
		await expect(call(security.notifyTwoFactorChanged, { enabled: true })).resolves.toEqual({
			sent: true,
		});
		await flushBackground();
		expect(email.sendTwoFactorChangedEmail).toHaveBeenCalledWith("me@example.com", "Me", true);
	});
});

describe("notifyPasskeyChanged", () => {
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(security.notifyPasskeyChanged, { added: true })).rejects.toMatchObject(
			httpError(401),
		);
	});
	it("mails the caller", async () => {
		asUser(fakeUser(undefined, { email: "me@example.com", name: "Me" }));
		await expect(
			call(security.notifyPasskeyChanged, { added: false, name: "Laptop" }),
		).resolves.toEqual({ sent: true });
		await flushBackground();
		expect(email.sendPasskeyChangedEmail).toHaveBeenCalledWith(
			"me@example.com",
			"Me",
			false,
			"Laptop",
		);
	});
});
