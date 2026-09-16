import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

export const BUG_STATUSES = ["open", "closed"] as const;
export const BugStatusSchema = v.picklist(BUG_STATUSES);
export type BugStatus = v.InferOutput<typeof BugStatusSchema>;

/** Form boundary for the footer's "Report a bug". The page and browser are filled in by the form itself. */
export const BugReportCreateSchema = v.object({
	title: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty("Give the bug a short title."),
		v.maxLength(120, "Keep the title under 120 characters."),
	),
	body: v.pipe(
		v.string(),
		v.trim(),
		v.nonEmpty("Say what happened and what you expected."),
		v.maxLength(4000, "Keep the description under 4000 characters."),
	),
	pageUrl: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(500)), ""),
	userAgent: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(300)), ""),
});

export const BugReportStatusSchema = v.object({ id: NanoIdSchema, status: BugStatusSchema });

export type BugReportCreate = v.InferOutput<typeof BugReportCreateSchema>;
