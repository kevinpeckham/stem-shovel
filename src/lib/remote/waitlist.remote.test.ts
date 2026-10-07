import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import { asSignedOut, call, httpError } from "../../../tests/helpers/fakeRequestEvent";
import {
	background,
	data,
	email,
	rateLimited,
	resetRemoteMocks,
} from "../../../tests/helpers/fakeServerModules";

/** The waitlist is open to visitors; what it must get right is the honeypot, the limiter and the token-only manage page. */
const waitlist = await import("./waitlist.remote");

const TOKEN = "t".repeat(32);

beforeEach(resetRemoteMocks);

describe("join", () => {
	beforeEach(() =>
		data.joinWaitlist.mockResolvedValue({
			next: "confirm",
			row: {
				email: "me@example.com",
				name: "",
				confirmToken: TOKEN,
				manageToken: TOKEN,
				updatesOk: false,
			},
		}),
	);
	it("a visitor joins; the address is lowercased and the page recorded", async () => {
		asSignedOut();
		await expect(call(waitlist.join, { email: "Me@Example.com" })).resolves.toEqual({
			next: "confirm",
		});
		expect(data.joinWaitlist).toHaveBeenCalledWith({
			email: "me@example.com",
			name: "",
			updatesOk: false,
			source: "/",
		});
	});
	it("the confirmation mail goes out after the response, to the address joined", async () => {
		asSignedOut();
		await call(waitlist.join, { email: "me@example.com" });
		await Promise.all(background.mock.calls.map(([work]) => (work as () => Promise<void>)()));
		expect(email.sendWaitlistConfirmEmail).toHaveBeenCalledWith(
			expect.objectContaining({
				to: "me@example.com",
				confirmUrl: `http://localhost/waitlist/confirm/${TOKEN}`,
			}),
		);
	});
	it("a filled honeypot never reaches the handler; the limiter answers 429", async () => {
		asSignedOut();
		await expect(
			call(waitlist.join, { email: "me@example.com", website: "spam" }),
		).rejects.toThrow();
		rateLimited.mockResolvedValue(true);
		await expect(call(waitlist.join, { email: "me@example.com" })).rejects.toMatchObject(
			httpError(429),
		);
		expect(data.joinWaitlist).not.toHaveBeenCalled();
	});
});

describe("prefs", () => {
	it("the manage token alone decides; a dead one is 404", async () => {
		asSignedOut();
		data.setWaitlistPrefs.mockResolvedValue({ status: "removed", updatesOk: false });
		await expect(call(waitlist.prefs, { token: TOKEN, action: "leave" })).resolves.toEqual({
			status: "removed",
			updatesOk: false,
		});
		expect(data.setWaitlistPrefs).toHaveBeenCalledWith(TOKEN, "leave");
		data.setWaitlistPrefs.mockResolvedValue(null);
		await expect(call(waitlist.prefs, { token: TOKEN, action: "leave" })).rejects.toMatchObject(
			httpError(404),
		);
	});
	it("refuses a malformed token before touching the list", async () => {
		asSignedOut();
		await expect(call(waitlist.prefs, { token: "short", action: "leave" })).rejects.toThrow();
		expect(data.setWaitlistPrefs).not.toHaveBeenCalled();
	});
});
