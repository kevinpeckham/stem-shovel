import { afterEach, describe, expect, test, vi } from "vite-plus/test";

const env = { KV_REST_API_URL: "", KV_REST_API_TOKEN: "" };
vi.mock("varlock/env", () => ({ ENV: env }));
const { HOUR, MINUTE, rateLimited, rateLimitedInMemory } = await import("./rateLimit");

describe("rateLimitedInMemory", () => {
	test("allows up to the limit in the window, then refuses until it slides", () => {
		const t0 = 1_000_000;
		expect(rateLimitedInMemory("k", 2, MINUTE, t0)).toBe(false);
		expect(rateLimitedInMemory("k", 2, MINUTE, t0 + 10)).toBe(false);
		expect(rateLimitedInMemory("k", 2, MINUTE, t0 + 20)).toBe(true);
		expect(rateLimitedInMemory("k", 2, MINUTE, t0 + MINUTE + 1)).toBe(false);
	});
	test("keys are independent", () => {
		expect(rateLimitedInMemory("a", 1, HOUR, 5)).toBe(false);
		expect(rateLimitedInMemory("b", 1, HOUR, 5)).toBe(false);
		expect(rateLimitedInMemory("a", 1, HOUR, 6)).toBe(true);
	});
});

describe("rateLimited", () => {
	afterEach(() => {
		env.KV_REST_API_URL = "";
		env.KV_REST_API_TOKEN = "";
		vi.unstubAllGlobals();
	});
	test("without Redis it is the in-memory window", async () => {
		expect(await rateLimited("m", 1, HOUR, 100)).toBe(false);
		expect(await rateLimited("m", 1, HOUR, 101)).toBe(true);
	});
	test("with Redis it counts the window's bucket with INCR and an expiry, exact across calls", async () => {
		env.KV_REST_API_URL = "https://kv.example";
		env.KV_REST_API_TOKEN = "t";
		let count = 0;
		const calls: unknown[] = [];
		vi.stubGlobal(
			"fetch",
			vi.fn(async (_url: string, init: RequestInit) => {
				const commands = JSON.parse(init.body as string) as unknown[][];
				calls.push(commands);
				count += 1;
				return new Response(JSON.stringify([{ result: count }, { result: 1 }]), { status: 200 });
			}),
		);
		const t = 3_600_000 * 5 + 10;
		expect(await rateLimited("r", 2, HOUR, t)).toBe(false);
		expect(await rateLimited("r", 2, HOUR, t)).toBe(false);
		expect(await rateLimited("r", 2, HOUR, t)).toBe(true);
		expect(calls[0]).toEqual([
			["INCR", "rl:r:5"],
			["PEXPIRE", "rl:r:5", HOUR, "NX"],
		]);
	});
	test("a Redis failure falls back to memory rather than refusing everyone", async () => {
		env.KV_REST_API_URL = "https://kv.example";
		env.KV_REST_API_TOKEN = "t";
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => new Response("nope", { status: 500 })),
		);
		vi.spyOn(console, "warn").mockImplementation(() => {});
		expect(await rateLimited("f", 1, HOUR, 1)).toBe(false);
		expect(await rateLimited("f", 1, HOUR, 2)).toBe(true);
	});
});
