import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";

const env = vi.hoisted(() => ({ AI_GATEWAY_API_KEY: "test-key" as string | undefined }));
vi.mock("varlock/env", () => ({ ENV: env }));
vi.mock("#lib/server/data.js", () => ({ logAiRequest: vi.fn(async () => {}) }));

const { logAiRequest } = await import("#lib/server/data.js");
const { Ai, AiError, AiParseError, AiTuning, askForJson } = await import("./ai");
type Message = import("./ai").Message;

const fast = { attempts: 2, timeout: "1 second", backoff: "1 millis" } as const;
const log = vi.mocked(logAiRequest);

/** A fake gateway answering from a script, each call's messages kept. */
function fakeAi(replies: (string | InstanceType<typeof AiError>)[]) {
	const calls: Message[][] = [];
	const layer = Layer.succeed(Ai, {
		complete: (_model, messages) => {
			calls.push([...messages]);
			const next = replies.shift()!;
			return typeof next === "string"
				? Effect.succeed({ text: next, usage: { inputTokens: 10, outputTokens: 5 } })
				: Effect.fail(next);
		},
	});
	return { calls, layer };
}

const parse = (text: string) => {
	const value = JSON.parse(text) as { ok?: boolean };
	if (!value.ok) throw new Error("no ok");
	return value;
};

function ask(layer: Layer.Layer<InstanceType<typeof Ai>>) {
	return Effect.runPromise(
		askForJson({
			kind: "text-to-beat",
			model: "m",
			who: { userId: "u1" },
			messages: [
				{ role: "system", content: "sys" },
				{ role: "user", content: "a beat" },
			],
			parse,
			rejectionNote: (reason) => `Rejected: ${reason}.`,
		}).pipe(Effect.provide(layer), Effect.provideService(AiTuning, fast)),
	);
}

beforeEach(() => {
	log.mockClear();
	env.AI_GATEWAY_API_KEY = "test-key";
});

describe("askForJson", () => {
	it("good JSON the first time: one log with what was parsed", async () => {
		const { layer, calls } = fakeAi(['{"ok": true}']);
		await expect(ask(layer)).resolves.toEqual({ ok: true });
		expect(calls).toHaveLength(1);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0]![0]).toMatchObject({
			kind: "text-to-beat",
			model: "m",
			userId: "u1",
			songId: null,
			prompt: "SYSTEM:\nsys\n\nUSER:\na beat",
			response: '{"ok": true}',
			parsed: { ok: true },
			inputTokens: 10,
			outputTokens: 5,
		});
	});

	it("bad, then good: the second request carries the reply and the rejection note", async () => {
		const { layer, calls } = fakeAi(['{"ok": false}', '{"ok": true}']);
		await expect(ask(layer)).resolves.toEqual({ ok: true });
		expect(log).toHaveBeenCalledTimes(2);
		expect(log.mock.calls[0]![0]).toMatchObject({ error: "no ok", response: '{"ok": false}' });
		expect(calls[1]!.slice(2)).toEqual([
			{ role: "assistant", content: '{"ok": false}' },
			{ role: "user", content: "Rejected: no ok." },
		]);
	});

	it("bad twice: AiParseError with today's message", async () => {
		const { layer } = fakeAi(["nope", '{"ok": false}']);
		const error = await ask(layer).catch((e: unknown) => e);
		expect(error).toBeInstanceOf(AiParseError);
		expect((error as Error).message).toBe("The model's answer could not be read (no ok)");
		expect(log).toHaveBeenCalledTimes(2);
	});

	it("a transport failure: logged once with the error, no second attempt", async () => {
		const failure = new AiError({ status: 503, detail: "busy" });
		const { layer, calls } = fakeAi([failure, '{"ok": true}']);
		await expect(ask(layer)).rejects.toBe(failure);
		expect(calls).toHaveLength(1);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log.mock.calls[0]![0]).toMatchObject({ error: "The gateway answered 503: busy" });
	});
});

describe("Ai.live", () => {
	const answer = (status: number, body: unknown) =>
		new Response(JSON.stringify(body), { status, statusText: status === 200 ? "OK" : "Err" });
	const ok = () =>
		answer(200, {
			choices: [{ message: { content: "hi" } }],
			usage: { prompt_tokens: 3, completion_tokens: 2 },
		});
	const run = () =>
		Effect.runPromise(
			Effect.gen(function* () {
				const ai = yield* Ai;
				return yield* ai.complete("m", [{ role: "user", content: "x" }]);
			}).pipe(Effect.provide(Ai.live), Effect.provideService(AiTuning, fast)),
		);

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("retries a 503 once", async () => {
		const fetch = vi
			.fn()
			.mockResolvedValueOnce(answer(503, { error: { message: "busy" } }))
			.mockResolvedValueOnce(ok());
		vi.stubGlobal("fetch", fetch);
		await expect(run()).resolves.toEqual({
			text: "hi",
			usage: { inputTokens: 3, outputTokens: 2 },
		});
		expect(fetch).toHaveBeenCalledTimes(2);
		const body = JSON.parse(fetch.mock.calls[0]![1].body as string);
		expect(body).toMatchObject({ reasoning: { effort: "none" }, stream: false, max_tokens: 1500 });
		expect(fetch.mock.calls[0]![1].signal).toBeInstanceOf(AbortSignal);
	});

	it("never retries a 400, and keeps today's message", async () => {
		const fetch = vi.fn().mockResolvedValue(answer(400, { error: "bad model" }));
		vi.stubGlobal("fetch", fetch);
		await expect(run()).rejects.toThrow(/^The gateway answered 400: bad model$/);
		expect(fetch).toHaveBeenCalledTimes(1);
	});

	it("retries a network error (undici's TypeError) once", async () => {
		const fetch = vi
			.fn()
			.mockRejectedValueOnce(new TypeError("fetch failed"))
			.mockResolvedValueOnce(ok());
		vi.stubGlobal("fetch", fetch);
		await expect(run()).resolves.toMatchObject({ text: "hi" });
		expect(fetch).toHaveBeenCalledTimes(2);
	});

	it("gives up after one retry of a timeout, as an AiError", async () => {
		const fetch = vi.fn(
			(_url: string, init: RequestInit) =>
				new Promise<Response>((_, reject) => {
					init.signal?.addEventListener("abort", () => reject(new Error("aborted")));
				}),
		);
		vi.stubGlobal("fetch", fetch);
		const error = await Effect.runPromise(
			Effect.gen(function* () {
				const ai = yield* Ai;
				return yield* ai.complete("m", []);
			}).pipe(
				Effect.provide(Ai.live),
				Effect.provideService(AiTuning, { ...fast, timeout: "20 millis" }),
				Effect.flip,
			),
		);
		expect(error).toBeInstanceOf(AiError);
		expect(error.message).toBe("The gateway timed out after 0.02 s");
		expect(fetch).toHaveBeenCalledTimes(2);
		expect(fetch.mock.calls[0]![1].signal?.aborted).toBe(true);
	});

	it("fails without a key, with today's message", async () => {
		env.AI_GATEWAY_API_KEY = undefined;
		await expect(run()).rejects.toThrow(/^AI_GATEWAY_API_KEY is not configured$/);
	});
});
