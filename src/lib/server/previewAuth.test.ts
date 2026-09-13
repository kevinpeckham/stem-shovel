import { beforeEach, describe, expect, test, vi } from "vite-plus/test";

// vi.mock factories are hoisted above imports, so their inputs must be hoisted too.
const { env, findFirst } = vi.hoisted(() => ({
	env: {} as { PREVIEW_AUTH_TOKEN?: string },
	findFirst: vi.fn(),
}));
vi.mock("varlock/env", () => ({ ENV: env }));
vi.mock("$lib/server/db", () => ({
	db: { query: { user: { findFirst } } },
	schema: { user: { email: "email" } },
}));
vi.mock("drizzle-orm", () => ({ eq: (a: unknown, b: unknown) => [a, b] }));

const { resolvePreviewAuth } = await import("./previewAuth");
const request = (token?: string) => ({
	request: { headers: new Headers(token ? { "x-preview-token": token } : {}) },
	cookies: { get: () => undefined },
});
const GOOD = "a".repeat(48);

describe("resolvePreviewAuth (fail-closed screenshot bypass)", () => {
	beforeEach(() => {
		findFirst.mockReset();
		findFirst.mockResolvedValue({
			id: "bot",
			name: "Screenshot Bot",
			email: "screenshot-bot@stem-shovel.com",
			isActive: true,
		});
	});
	test("no configured token → nobody, whatever the request says", async () => {
		env.PREVIEW_AUTH_TOKEN = undefined;
		expect(await resolvePreviewAuth(request(GOOD))).toBeNull();
	});
	test("a short configured token disables the bypass", async () => {
		env.PREVIEW_AUTH_TOKEN = "short";
		expect(await resolvePreviewAuth(request("short"))).toBeNull();
	});
	test("wrong or missing request token → null", async () => {
		env.PREVIEW_AUTH_TOKEN = GOOD;
		expect(await resolvePreviewAuth(request())).toBeNull();
		expect(await resolvePreviewAuth(request("b".repeat(48)))).toBeNull();
		expect(await resolvePreviewAuth(request(GOOD.slice(0, 47)))).toBeNull();
	});
	test("the right token resolves the bot user", async () => {
		env.PREVIEW_AUTH_TOKEN = GOOD;
		expect(await resolvePreviewAuth(request(GOOD))).toEqual({
			id: "bot",
			name: "Screenshot Bot",
			email: "screenshot-bot@stem-shovel.com",
		});
	});
	test("the cookie works too, and a missing or inactive bot is nobody", async () => {
		env.PREVIEW_AUTH_TOKEN = GOOD;
		const viaCookie = {
			request: { headers: new Headers() },
			cookies: { get: (n: string) => (n === "preview_token" ? GOOD : undefined) },
		};
		expect(await resolvePreviewAuth(viaCookie)).not.toBeNull();
		findFirst.mockResolvedValue(undefined);
		expect(await resolvePreviewAuth(request(GOOD))).toBeNull();
		findFirst.mockResolvedValue({ id: "bot", name: "Bot", email: "x", isActive: false });
		expect(await resolvePreviewAuth(request(GOOD))).toBeNull();
	});
});
