/**
 * Mail as an Effect service (docs/effect-adoption.md, Phase 2 step 5): the
 * inbox's two sends (`sendNotificationEmail`, `sendDigestEmail`) under a
 * timeout and never retried, since a retry of a send that did reach Resend
 * is how a person gets the same email twice. `markedUntilFailure` is the
 * mark-first half of that rule, and `runMail` the Promise edge for the
 * inbox (the cron function and the page functions, not the jobs runtime).
 */
import * as Cause from "effect/Cause";
import * as Context from "effect/Context";
import * as Data from "effect/Data";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import * as Layer from "effect/Layer";
import { sendDigestEmail, sendNotificationEmail } from "#lib/server/email.js";
import { Db } from "./services.js";

type NotificationEmail = Parameters<typeof sendNotificationEmail>[0];
type DigestEmail = Parameters<typeof sendDigestEmail>[0];
type MailKind = "notification" | "digest";

/** A send that threw (Resend refused it, the network failed) or did not answer in time. */
class MailError extends Data.TaggedError("MailError")<{
	readonly kind: MailKind;
	readonly timedOut: boolean;
	readonly cause?: unknown;
}> {
	constructor(args: { kind: MailKind; timedOut: boolean; cause?: unknown }) {
		super(args);
		this.message = args.timedOut
			? `The ${args.kind} email timed out after ${SEND_TIMEOUT}`
			: `The ${args.kind} email failed: ${args.cause instanceof Error ? args.cause.message : String(args.cause)}`;
	}
}

const SEND_TIMEOUT = "20 seconds";

export class Mail extends Context.Service<
	Mail,
	{
		readonly notification: (email: NotificationEmail) => Effect.Effect<void, MailError>;
		readonly digest: (email: DigestEmail) => Effect.Effect<void, MailError>;
	}
>()("Mail") {
	static readonly live = Layer.succeed(Mail, {
		notification: (email) => send("notification", () => sendNotificationEmail(email)),
		digest: (email) => send("digest", () => sendDigestEmail(email)),
	});
}

/**
 * One send, bounded and never retried. Resend's client takes no abort
 * signal, so a timeout stops the wait, not the request: a send that
 * reaches Resend after its 20 s still delivers, and its mark has been
 * cleared by then (the rare duplicate this design still allows).
 */
function send(kind: MailKind, run: () => Promise<void>): Effect.Effect<void, MailError> {
	return Effect.tryPromise({
		try: async () => run(),
		catch: (cause) => new MailError({ kind, timedOut: false, cause }),
	}).pipe(
		Effect.timeout(SEND_TIMEOUT),
		Effect.catchIf(Cause.isTimeoutError, (cause) =>
			Effect.fail(new MailError({ kind, timedOut: true, cause })),
		),
	);
}

/**
 * Sets a "sent" mark before the send it guards, and puts it back when the
 * rest of the scope fails or is interrupted (a send failure, a timeout).
 * A success keeps it. So a mark that cannot be written stops the send,
 * and a failed send is tried again by the next run. The trade-off: a crash
 * between the mark and the send (the function killed mid-flight) loses
 * that one email instead of sending it twice. Clearing is best effort:
 * if it fails too, the email is lost rather than doubled.
 */
export function markedUntilFailure<E, R, R2>(
	mark: Effect.Effect<void, E, R>,
	unmark: Effect.Effect<unknown, unknown, R2>,
) {
	return Effect.acquireRelease(mark, (_, exit) =>
		Exit.isFailure(exit) ? Effect.ignore(unmark) : Effect.void,
	);
}

const MailLayer = Layer.mergeAll(Db.live, Mail.live);

/** The Promise edge: the live database and mail; a typed failure rejects as itself. */
export function runMail<A, E>(effect: Effect.Effect<A, E, Db | Mail>): Promise<A> {
	return Effect.runPromise(effect.pipe(Effect.provide(MailLayer)));
}
