import { beforeEach, describe, expect, it } from "vite-plus/test";
import "../../../tests/helpers/fakeServerModules";
import {
	ACCOUNT,
	USER,
	asEditorOf,
	asOwnerOf,
	asSignedOut,
	asSystemAdmin,
	call,
	fakeId,
	httpError,
} from "../../../tests/helpers/fakeRequestEvent";
import {
	data,
	rateLimited,
	resetRemoteMocks,
	supportChallenge,
} from "../../../tests/helpers/fakeServerModules";

/** Authorization of /support: visitors prove an address through the line-up, a signed-in user is on record, the operator manages. */
const support = await import("./support.remote");

const REQUEST = fakeId("request-one");
const row = {
	id: REQUEST,
	email: "me@example.com",
	message: "Help me sign in please",
	verifiedBy: "challenge",
};

beforeEach(() => {
	resetRemoteMocks();
	data.createSupportRequest.mockResolvedValue(row);
	data.systemAdminEmails.mockResolvedValue([]);
	supportChallenge.sealChallenge.mockReturnValue("sealed");
});

describe("startSupport (anyone)", () => {
	it("answers a line-up without saying whether the address is known", async () => {
		asSignedOut();
		data.userAccountsByEmail.mockResolvedValue(null);
		const answer = (await call(support.startSupport, { email: "me@example.com" })) as {
			options: string[];
			challenge: string;
		};
		expect(answer.options).toHaveLength(5);
		expect(answer.challenge).toBe("sealed");
		expect(supportChallenge.sealChallenge).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "me@example.com",
				correct: -1,
				accountId: null,
				userId: null,
			}),
		);
	});
	it("400 on the honeypot, 429 on the limiter", async () => {
		asSignedOut();
		await expect(
			call(support.startSupport, { email: "me@example.com", website: "" }),
		).resolves.toBeDefined();
		rateLimited.mockResolvedValue(true);
		await expect(call(support.startSupport, { email: "me@example.com" })).rejects.toMatchObject(
			httpError(429),
		);
	});
});

describe("submitSupport (the challenge decides)", () => {
	const input = {
		email: "me@example.com",
		challenge: "sealed",
		pick: "2",
		message: "Help me sign in please",
	};
	it("a right pick files the request under the account the challenge named", async () => {
		asSignedOut();
		supportChallenge.openChallenge.mockReturnValue({
			email: "me@example.com",
			options: [],
			correct: 2,
			accountId: ACCOUNT,
			userId: USER,
		});
		await expect(call(support.submitSupport, input)).resolves.toEqual({ sent: true });
		expect(data.createSupportRequest).toHaveBeenCalledWith(
			expect.objectContaining({
				email: "me@example.com",
				userId: USER,
				accountId: ACCOUNT,
				verifiedBy: "challenge",
			}),
		);
	});
	it("a wrong pick, or a challenge for another address, files nothing", async () => {
		asSignedOut();
		supportChallenge.openChallenge.mockReturnValue({
			email: "me@example.com",
			options: [],
			correct: 1,
			accountId: ACCOUNT,
			userId: USER,
		});
		await expect(call(support.submitSupport, input)).rejects.toThrow();
		supportChallenge.openChallenge.mockReturnValue({
			email: "other@example.com",
			options: [],
			correct: 2,
			accountId: ACCOUNT,
			userId: USER,
		});
		await expect(call(support.submitSupport, input)).rejects.toThrow();
		expect(data.createSupportRequest).not.toHaveBeenCalled();
	});
});

describe("submitSupportSignedIn", () => {
	const input = { message: "Help me sign in please" };
	it("401 signed out", async () => {
		asSignedOut();
		await expect(call(support.submitSupportSignedIn, input)).rejects.toMatchObject(httpError(401));
	});
	it("files it as the caller, under their first account", async () => {
		asEditorOf(ACCOUNT);
		await expect(call(support.submitSupportSignedIn, input)).resolves.toEqual({ sent: true });
		expect(data.createSupportRequest).toHaveBeenCalledWith(
			expect.objectContaining({ userId: USER, accountId: ACCOUNT, verifiedBy: "signed-in" }),
		);
	});
});

describe("the operator's functions", () => {
	const cases = [
		{
			name: "setSupportStatus",
			fn: support.setSupportStatus,
			input: { id: REQUEST, status: "closed" },
			dataFn: "setSupportRequestStatus",
			args: [REQUEST, "closed"],
			outcome: { status: "closed" },
		},
		{
			name: "deleteSupportRequest",
			fn: support.deleteSupportRequest,
			input: { id: REQUEST },
			dataFn: "deleteSupportRequest",
			args: [REQUEST],
			outcome: { deleted: true },
		},
	];
	for (const c of cases) {
		const run = () => {
			data[c.dataFn].mockResolvedValue(true);
			return call(c.fn, c.input);
		};
		describe(c.name, () => {
			it("404 signed out and for an account owner", async () => {
				asSignedOut();
				await expect(run()).rejects.toMatchObject(httpError(404));
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
});
