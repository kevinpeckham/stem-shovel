import * as Effect from "effect/Effect";
import { runtime } from "./runtime.js";
import type { Services } from "./services.js";

/**
 * The edge between an Effect program and the Promise world: runs it on the
 * live runtime under a span named `name`. On failure `runPromise` rejects
 * with `Cause.squash(cause)`, so the thrown value is the tagged error itself
 * (its `_tag` and `message`), or the defect for a die. It does not report:
 * the caller's `eachJob` or `background` sends a throw to Sentry (Phase 0).
 */
export function runJob<A, E>(name: string, effect: Effect.Effect<A, E, Services>): Promise<A> {
	return runtime.runPromise(Effect.withSpan(effect, name));
}
