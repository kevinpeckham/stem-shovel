import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import type { BugStatus, ReportKind, ReportPriority } from "../../../val/BugReportSchema";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A bug report or feature request from a signed-in user (the footer's
 * "Report a bug", the Feature Requests page's "Request a feature"): what
 * they typed, plus the page they were on and their browser, captured for
 * them. System admins read, prioritise, answer and close them on /admin and
 * get an email when one comes in.
 */
export const bugReport = table(
	"bug_report",
	{
		id: id(),
		userId: t.text("user_id").references(() => user.id, { onDelete: "set null" }),
		kind: t.text("kind").$type<ReportKind>().notNull().default("bug"),
		title: t.text("title").notNull(),
		body: t.text("body").notNull(),
		pageUrl: t.text("page_url").notNull().default(""),
		userAgent: t.text("user_agent").notNull().default(""),
		/** Where the requester said we may write about it (learn more, or when it ships); null when they did not offer one (migration 0045). */
		contactEmail: t.text("contact_email"),
		status: t.text("status").$type<BugStatus>().notNull().default("open"),
		closedAt: t.integer("closed_at", { mode: "timestamp_ms" }),
		/** Admin's call on a feature request: high, medium, low, or none yet (migration 0044). */
		priority: t.text("priority").$type<ReportPriority>(),
		/** The admin's written response, shown to signed-in users on /feature-requests and emailed to the requester. */
		response: t.text("response").notNull().default(""),
		respondedAt: t.integer("responded_at", { mode: "timestamp_ms" }),
		...timestamps,
	},
	(table) => [
		t.index("bug_report_user_idx").on(table.userId),
		t.index("bug_report_status_idx").on(table.status, table.createdAt),
	],
);
