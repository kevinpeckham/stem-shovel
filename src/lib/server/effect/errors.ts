import * as Data from "effect/Data";

/**
 * The typed failures of the Effect pilot (docs/effect-adoption.md). Each
 * sets a readable `message`, so the Sentry issue a job's throw becomes
 * (through `eachJob`/`background`) says what happened, and its `_tag`
 * says which kind of thing failed.
 */

type BlobOp = "read" | "put" | "delete";

/** A Blob read, upload or delete that failed: a thrown call, or a read answering a non-2xx status. */
export class BlobError extends Data.TaggedError("BlobError")<{
	readonly op: BlobOp;
	readonly url?: string;
	readonly status?: number;
	readonly cause?: unknown;
}> {
	constructor(args: { op: BlobOp; url?: string; status?: number; cause?: unknown }) {
		super(args);
		const what = args.status ? `answered ${args.status}` : `failed: ${causeText(args.cause)}`;
		this.message = `Blob ${args.op}${args.url ? ` ${args.url}` : ""} ${what}`;
	}
}

/** A database call that threw (a Turso 502, a constraint). */
export class DbError extends Data.TaggedError("DbError")<{
	readonly op: string;
	readonly cause: unknown;
}> {
	constructor(args: { op: string; cause: unknown }) {
		super(args);
		this.message = `Database ${args.op} failed: ${causeText(args.cause)}`;
	}
}

/** An ffmpeg run that exited non-zero, was killed, or could not start. */
export class FfmpegError extends Data.TaggedError("FfmpegError")<{
	readonly code: number | null;
	readonly signal?: string | null;
	/** The last ~2 kB of stderr: ffmpeg says why at the end. */
	readonly stderr: string;
	readonly timedOut: boolean;
}> {
	constructor(args: {
		code: number | null;
		signal?: string | null;
		stderr: string;
		timedOut: boolean;
	}) {
		super(args);
		const how = args.timedOut
			? "timed out"
			: args.signal
				? `was killed (${args.signal})`
				: args.code === null
					? "failed"
					: `exited with ${args.code}`;
		const last = args.stderr.trim().split("\n").at(-1);
		this.message = `ffmpeg ${how}${last ? `: ${last}` : ""}`;
	}

	/** No binary for this platform (ffmpeg-static has none). */
	static unavailable() {
		return new FfmpegError({
			code: null,
			stderr: "ffmpeg binary is not available on this platform",
			timedOut: false,
		});
	}
}

function causeText(cause: unknown): string {
	return cause instanceof Error ? cause.message : String(cause);
}
