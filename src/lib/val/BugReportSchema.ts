import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** What the footer form sends: a bug, or a feature request. Same table, same handling. */
export const REPORT_KINDS = ["bug", "feature"] as const;
export const ReportKindSchema = v.picklist(REPORT_KINDS);
export type ReportKind = v.InferOutput<typeof ReportKindSchema>;

export const BUG_STATUSES = ["open", "closed"] as const;
export const BugStatusSchema = v.picklist(BUG_STATUSES);
export type BugStatus = v.InferOutput<typeof BugStatusSchema>;

/** Form boundary for the footer's "Report a bug" / "Request a feature". The page and browser are filled in by the form itself. */
export const BugReportCreateSchema = v.object({
	kind: v.optional(ReportKindSchema, "bug"),
	title: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty("Give it a short title."),
		v.maxLength(120, "Keep the title under 120 characters."),
	),
	body: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty("Say a little more than the title."),
		v.maxLength(4000, "Keep the description under 4000 characters."),
	),
	pageUrl: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ""),
	userAgent: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300)), ""),
});

export const BugReportStatusSchema = v.object({ id: NanoIdSchema, status: BugStatusSchema });

export type BugReportCreate = v.InferOutput<typeof BugReportCreateSchema>;
