import * as Data from "effect/Data";

/** Verovio could not engrave a notation file, or pdfkit could not write its pages (src/lib/server/notationPdf.ts). */
export class EngraveError extends Data.TaggedError("EngraveError")<{
	readonly filename: string;
	readonly cause: unknown;
}> {
	constructor(args: { filename: string; cause: unknown }) {
		super(args);
		const why = args.cause instanceof Error ? args.cause.message : String(args.cause);
		this.message = `Engraving ${args.filename} failed: ${why}`;
	}
}
