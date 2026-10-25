/**
 * The AI Gateway as an Effect service (docs/effect-adoption.md, Phase 2
 * step 4): one chat completion with a transport timeout and one retry of
 * a transport failure, and `askForJson`, the ask-parse-ask-again loop
 * Text-to-Beat and Text-to-Progression share, whose parse retry is
 * separate from the transport's. `runAi` is the Promise edge.
 */
import { ENV } from "varlock/env";
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Duration from "effect/Duration";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import * as Schedule from "effect/Schedule";
import { logAiRequest } from "#lib/server/data.js";

const GATEWAY = "https://ai-gateway.vercel.sh/v1/chat/completions";
/** A beat or a progression is a few hundred tokens; this is the guard against a model that rambles. */
const MAX_OUTPUT_TOKENS = 1500;

export interface Message {
	role: "system" | "user" | "assistant";
	content: string;
}

interface Usage {
	inputTokens?: number;
	outputTokens?: number;
}

/** A gateway call that failed: an HTTP status, a network error, a timeout or a missing key. */
export class AiError extends Data.TaggedError("AiError")<{
	readonly status?: number;
	readonly detail: string;
	readonly cause?: unknown;
}> {
	constructor(args: { status?: number; detail: string; cause?: unknown }) {
		super(args);
		this.message =
			args.status === undefined
				? args.detail
				: `The gateway answered ${args.status}: ${args.detail}`;
	}
}

/** The model answered, twice, with something its parser refused. */
export class AiParseError extends Data.TaggedError("AiParseError")<{
	readonly lastError: string;
}> {
	constructor(args: { lastError: string }) {
		super(args);
		this.message = `The model's answer could not be read (${args.lastError})`;
	}
}

/** The knobs tests turn down: parse attempts, the per-call timeout, the retry's backoff base. */
export const AiTuning = Context.Reference<{
	readonly attempts: number;
	readonly timeout: Duration.Input;
	readonly backoff: Duration.Input;
}>("AiTuning", {
	defaultValue: () => ({ attempts: 2, timeout: "60 seconds", backoff: "1 second" }),
});

/** Worth one more go: the gateway's 5xx or 429, a network error (undici's TypeError), a timeout. Never another 4xx. */
const isTransport = (e: AiError) =>
	e.status !== undefined
		? e.status >= 500 || e.status === 429
		: e.cause instanceof TypeError || Cause.isTimeoutError(e.cause);

export class Ai extends Context.Service<
	Ai,
	{
		/** One chat completion through the gateway, reasoning off, the text and the token counts back. */
		readonly complete: (
			model: string,
			messages: Message[],
		) => Effect.Effect<{ text: string; usage: Usage }, AiError>;
	}
>()("Ai") {
	static readonly live = Layer.succeed(Ai, {
		complete: (model, messages) =>
			Effect.gen(function* () {
				const key = ENV.AI_GATEWAY_API_KEY;
				if (!key) return yield* new AiError({ detail: "AI_GATEWAY_API_KEY is not configured" });
				const tuning = yield* AiTuning;
				const once = post(key, model, messages).pipe(
					Effect.timeout(tuning.timeout),
					Effect.catchIf(Cause.isTimeoutError, (cause) =>
						Effect.fail(
							new AiError({
								detail: `The gateway timed out after ${Duration.toSeconds(tuning.timeout)} s`,
								cause,
							}),
						),
					),
				);
				return yield* Effect.retry(once, {
					schedule: Schedule.jittered(Schedule.exponential(tuning.backoff)),
					times: 1,
					while: isTransport,
				});
			}).pipe(Effect.withSpan("ai.complete", { attributes: { model } })),
	});
}

interface GatewayBody {
	error?: { message?: string } | string;
	choices?: { message?: { content?: string | null } }[];
	usage?: { prompt_tokens?: number; completion_tokens?: number };
}

/** One POST to the gateway; the abort signal is the effect's, so a timeout cancels the request. */
function post(key: string, model: string, messages: Message[]) {
	return Effect.tryPromise({
		try: async (signal) => {
			const res = await fetch(GATEWAY, {
				method: "POST",
				headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
				body: JSON.stringify({
					model,
					messages,
					reasoning: { effort: "none" },
					max_tokens: MAX_OUTPUT_TOKENS,
					stream: false,
				}),
				signal,
			});
			const body = (await res.json().catch(() => null)) as GatewayBody | null;
			return { res, body };
		},
		catch: (cause) => new AiError({ detail: errorText(cause), cause }),
	}).pipe(Effect.flatMap(({ res, body }) => readReply(res, body)));
}

/** The reply's text and token counts, or the gateway's own reason for a failure. */
function readReply(res: Response, body: GatewayBody | null) {
	if (!res.ok || !body)
		return Effect.fail(new AiError({ status: res.status, detail: failureDetail(res, body) }));
	const { choices = [], usage = {} } = body;
	return Effect.succeed({
		text: choices[0]?.message?.content ?? "",
		usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens },
	});
}

function failureDetail(res: Response, body: GatewayBody | null): string {
	const error = body?.error;
	return typeof error === "string" ? error : (error?.message ?? res.statusText);
}

/**
 * Asks for a JSON reply and parses it; a reply the parser refuses gets
 * another go (AiTuning.attempts in all) with the reason appended. Every
 * call is logged (ai_request) with its tokens; a transport failure is
 * logged and ends it (the service already retried it).
 */
export function askForJson<T>(options: {
	kind: "text-to-beat" | "text-to-chords";
	model: string;
	who: { userId: string | null };
	messages: Message[];
	parse: (text: string) => T;
	rejectionNote: (reason: string) => string;
}): Effect.Effect<T, AiError | AiParseError, Ai> {
	const { kind, model, who, parse, rejectionNote } = options;
	return Effect.gen(function* () {
		const ai = yield* Ai;
		const { attempts } = yield* AiTuning;
		const messages = [...options.messages];
		let lastError = "";
		for (let attempt = 0; attempt < attempts; attempt++) {
			const started = Date.now();
			const log = {
				kind,
				model,
				userId: who.userId,
				songId: null,
				prompt: messages.map((m) => `${m.role.toUpperCase()}:\n${m.content}`).join("\n\n"),
			};
			const { text, usage } = yield* ai
				.complete(model, messages)
				.pipe(
					Effect.tapError((e) =>
						Effect.promise(() =>
							logAiRequest({ ...log, error: e.message, durationMs: Date.now() - started }),
						),
					),
				);
			try {
				const parsed = parse(text);
				yield* Effect.promise(() =>
					logAiRequest({
						...log,
						response: text,
						parsed,
						durationMs: Date.now() - started,
						...usage,
					}),
				);
				return parsed;
			} catch (e) {
				lastError = errorText(e);
				yield* Effect.promise(() =>
					logAiRequest({
						...log,
						response: text,
						error: lastError,
						durationMs: Date.now() - started,
						...usage,
					}),
				);
				messages.push(
					{ role: "assistant", content: text },
					{ role: "user", content: rejectionNote(lastError) },
				);
			}
		}
		return yield* new AiParseError({ lastError });
	});
}

/** The Promise edge: the live gateway, a span, and a typed failure thrown as itself (its message the user's 502). */
export function runAi<A>(name: string, effect: Effect.Effect<A, AiError | AiParseError, Ai>) {
	return Effect.runPromise(effect.pipe(Effect.provide(Ai.live), Effect.withSpan(name)));
}

function errorText(e: unknown): string {
	return e instanceof Error ? e.message : String(e);
}
