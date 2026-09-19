import * as v from "valibot";
import { NanoIdSchema } from "./NanoIdSchema";

/** What the footer form sends: a bug, or a feature request. Same table, same handling. */
export const REPORT_KINDS = ["bug", "feature"] as const;
export const ReportKindSchema = v.picklist(REPORT_KINDS);
export type ReportKind = v.InferOutput<typeof ReportKindSchema>;

/** open → complete (built) or closed (declined, duplicate, not a bug). */
export const BUG_STATUSES = ["open", "complete", "closed"] as const;
export const BugStatusSchema = v.picklist(BUG_STATUSES);
export type BugStatus = v.InferOutput<typeof BugStatusSchema>;

export const REPORT_PRIORITIES = ["high", "medium", "low"] as const;
export const ReportPrioritySchema = v.picklist(REPORT_PRIORITIES);
export type ReportPriority = v.InferOutput<typeof ReportPrioritySchema>;

/** Admin: set or clear a request's priority. */
export const BugReportPrioritySchema = v.object({
	id: NanoIdSchema,
	priority: v.union([ReportPrioritySchema, v.literal("")]),
});

/** Admin: a written response, shown on the feature requests page and emailed to the requester. */
export const BugReportResponseSchema = v.object({
	id: NanoIdSchema,
	response: v.pipe(
		v.string(),
		v.trim(),
		v.maxLength(4000, "Keep the response under 4000 characters."),
	),
});

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
	/** Given when the requester is happy to be emailed about it (to learn more, or when it ships); empty otherwise. */
	contactEmail: v.optional(
		v.pipe(
			v.string(),
			v.trim(),
			v.union([
				v.literal(""),
				v.pipe(
					v.string(),
					v.email("Enter a valid email address, or untick the box."),
					v.maxLength(254),
				),
			]),
		),
		"",
	),
});

export const BugReportStatusSchema = v.object({ id: NanoIdSchema, status: BugStatusSchema });

export type BugReportCreate = v.InferOutput<typeof BugReportCreateSchema>;
