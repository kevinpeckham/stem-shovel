import * as Data from "effect/Data";

/**
 * The note transcriber's child process (src/lib/server/notes.ts) exited
 * non-zero, was killed, could not start, or wrote something that is not
 * the notes it should.
 */
export class TranscriberError extends Data.TaggedError("TranscriberError")<{
	readonly code: number | null;
	readonly signal?: string | null;
	/** The last ~2 kB of stderr, or what was wrong with stdout. */
	readonly stderr: string;
}> {
	constructor(args: { code: number | null; signal?: string | null; stderr: string }) {
		super(args);
		const how = args.signal
			? `was killed (${args.signal})`
			: args.code === null
				? "failed"
				: `exited with ${args.code}`;
		const last = args.stderr.trim().split("\n").at(-1);
		this.message = `Note transcription ${how}${last ? `: ${last}` : ""}`;
	}
}
