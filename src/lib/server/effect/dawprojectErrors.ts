import * as Data from "effect/Data";

/**
 * A DAWproject export that cannot go on (src/lib/server/dawprojectExport.ts),
 * with a `message` written for the user: it becomes their notification.
 */
export class DawprojectError extends Data.TaggedError("DawprojectError")<{
	readonly message: string;
	readonly cause?: unknown;
}> {}
