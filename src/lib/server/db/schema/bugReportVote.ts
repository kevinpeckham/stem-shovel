import * as t from "drizzle-orm/sqlite-core";
import { sqliteTable as table } from "drizzle-orm/sqlite-core";
import { bugReport } from "./bugReport";
import { id, timestamps } from "./columns";
import { user } from "./user";

/**
 * A signed-in user's thumbs up (+1) or down (−1) on a feature request, one
 * per user and request (migration 0047). The request's score is the sum;
 * open requests list by score on /feature-requests.
 */
export const bugReportVote = table(
	"bug_report_vote",
	{
		id: id(),
		reportId: t
			.text("report_id")
			.notNull()
			.references(() => bugReport.id, { onDelete: "cascade" }),
		userId: t
			.text("user_id")
			.notNull()
			.references(() => user.id, { onDelete: "cascade" }),
		value: t.integer("value").notNull(),
		...timestamps,
	},
	(table) => [
		t.index("bug_report_vote_report_idx").on(table.reportId),
		t.index("bug_report_vote_user_idx").on(table.userId),
		t.unique("bug_report_vote_unique").on(table.reportId, table.userId),
	],
);
