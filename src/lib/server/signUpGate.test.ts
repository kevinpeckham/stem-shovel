import { describe, expect, test } from "vite-plus/test";
import { checkSignUp, PLAN_TERMS_REQUIRED, SIGN_UP_CLOSED, type SignUpLookups } from "./signUpGate";

const lookups: SignUpLookups = {
	invitation: async (token) =>
		token === "good-token-good-token-1"
			? { status: "open", email: "ann@example.com" }
			: token === "old-token-old-token-11"
				? { status: "expired", email: "ann@example.com" }
				: { status: "missing" },
	code: async (code) =>
		code === "ABCDEFGHJKMN"
			? { status: "open" }
			: code === "USEDUPCODE22"
				? { status: "used up" }
				: { status: "missing" },
};

const yes = { acceptPlanTerms: "yes" };

describe("checkSignUp", () => {
	test("the plan terms must be accepted, whatever else is offered", async () => {
		expect(await checkSignUp({ email: "x@example.com" }, lookups, { open: true })).toEqual({
			ok: false,
			message: PLAN_TERMS_REQUIRED,
		});
		expect(
			await checkSignUp(
				{
					email: "ann@example.com",
					inviteToken: "good-token-good-token-1",
					acceptPlanTerms: "on",
				},
				lookups,
			),
		).toEqual({ ok: false, message: PLAN_TERMS_REQUIRED });
	});
	test("open sign-up: nothing offered passes, and a code still joins its account", async () => {
		expect(await checkSignUp({ email: "x@example.com", ...yes }, lookups, { open: true })).toEqual({
			ok: true,
			via: "open",
		});
		expect(
			await checkSignUp({ email: "x@example.com", inviteCode: "ABCD-EFGH-JKMN", ...yes }, lookups, {
				open: true,
			}),
		).toEqual({ ok: true, via: "code", code: "ABCDEFGHJKMN" });
		// A bad code offered while open is still refused: the person meant to join somewhere.
		expect(
			await checkSignUp({ email: "x@example.com", inviteCode: "USED-UPCO-DE22", ...yes }, lookups, {
				open: true,
			}),
		).toMatchObject({ ok: false });
	});
	test("nothing offered: closed", async () => {
		expect(await checkSignUp({ email: "x@example.com", ...yes }, lookups)).toEqual({
			ok: false,
			message: SIGN_UP_CLOSED,
		});
	});
	test("an open invitation for the same address (any case) passes", async () => {
		const r = await checkSignUp(
			{ email: "Ann@Example.com", inviteToken: "good-token-good-token-1", ...yes },
			lookups,
		);
		expect(r).toEqual({ ok: true, via: "invitation", token: "good-token-good-token-1" });
	});
	test("an invitation for another address fails and names it", async () => {
		const r = await checkSignUp(
			{ email: "bob@example.com", inviteToken: "good-token-good-token-1", ...yes },
			lookups,
		);
		expect(r.ok).toBe(false);
		if (!r.ok) expect(r.message).toContain("ann@example.com");
	});
	test("an expired or unknown invitation fails with its reason", async () => {
		const r = await checkSignUp(
			{ email: "a@b.c", inviteToken: "old-token-old-token-11", ...yes },
			lookups,
		);
		expect(r).toMatchObject({ ok: false, message: expect.stringContaining("expired") });
		const m = await checkSignUp({ email: "a@b.c", inviteToken: "nope", ...yes }, lookups);
		expect(m).toMatchObject({ ok: false, message: expect.stringContaining("not valid") });
	});
	test("a code is normalised before the lookup", async () => {
		const r = await checkSignUp(
			{ email: "a@b.c", inviteCode: " abcd-efgh-jkmn ", ...yes },
			lookups,
		);
		expect(r).toEqual({ ok: true, via: "code", code: "ABCDEFGHJKMN" });
	});
	test("a used-up or malformed code fails", async () => {
		const u = await checkSignUp({ email: "a@b.c", inviteCode: "USED-UPCO-DE22", ...yes }, lookups);
		expect(u).toMatchObject({ ok: false, message: expect.stringContaining("no uses left") });
		const s = await checkSignUp({ email: "a@b.c", inviteCode: "short", ...yes }, lookups);
		expect(s).toMatchObject({ ok: false, message: expect.stringContaining("not valid") });
	});
	test("a token wins over a code when both are sent", async () => {
		const r = await checkSignUp(
			{
				email: "ann@example.com",
				inviteToken: "good-token-good-token-1",
				inviteCode: "nope",
				...yes,
			},
			lookups,
		);
		expect(r).toMatchObject({ ok: true, via: "invitation" });
	});
});
