import { describe, expect, test, vi } from "vite-plus/test";

vi.mock("varlock/env", () => ({
	ENV: { BETTER_AUTH_SECRET: "test-secret-test-secret-test-secret" },
}));
const { sealChallenge, openChallenge, CHALLENGE_TTL_MS } = await import("./supportChallenge");

const c = {
	email: "a@b.c",
	options: ["M*KK", "S***er P**es"],
	correct: 0,
	accountId: "acc1",
	userId: "u1",
};

describe("support challenge", () => {
	test("round-trips, and the answer is not readable from the token", () => {
		const token = sealChallenge(c);
		expect(token).not.toContain("acc1");
		expect(Buffer.from(token, "base64url").toString("utf8")).not.toContain("correct");
		expect(openChallenge(token)).toMatchObject(c);
	});
	test("a tampered or foreign token opens to nothing", () => {
		const token = sealChallenge(c);
		expect(openChallenge(token.slice(0, -4) + "AAAA")).toBeNull();
		expect(openChallenge("not-a-token")).toBeNull();
	});
	test("expires", () => {
		const token = sealChallenge(c, 1000);
		expect(openChallenge(token, 1000 + CHALLENGE_TTL_MS + 1)).toBeNull();
		expect(openChallenge(token, 1000 + CHALLENGE_TTL_MS - 1)).not.toBeNull();
	});
});
