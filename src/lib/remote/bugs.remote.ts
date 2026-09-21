import { form, getRequestEvent } from "$app/server";
import { requireSystemAdmin, requireUser } from "$lib/server/access";
import { background } from "$lib/server/background";
import {
	createBugReport,
	deleteBugReport as removeReport,
	respondToBugReport,
	setBugReportPriority,
	setBugReportApproval,
	setBugReportStatus,
	systemAdminEmails,
	voteOnBugReport,
} from "$lib/server/data";
import {
	sendBugReportEmail,
	sendFeatureShippedEmail,
	sendReportResponseEmail,
} from "$lib/server/email";
import {
	BugReportCreateSchema,
	BugReportPrioritySchema,
	BugReportResponseSchema,
	BugReportStatusSchema,
	BugReportApprovalSchema,
	BugReportVoteSchema,
} from "$lib/val/BugReportSchema";
import { IdSchema } from "$lib/val/SongSchema";
import { HOUR, rateLimited } from "$lib/server/rateLimit";
import { error } from "@sveltejs/kit";

/** Any signed-in user sends a bug report or a feature request (`kind`); the page and browser come from the form's hidden fields. */
export const reportBug = form(BugReportCreateSchema, async (input) => {
	const { locals, url } = getRequestEvent();
	const user = requireUser(locals);
	if (await rateLimited(`bug:${user.id}`, 10, HOUR))
		error(429, "That is a lot of reports for one hour; try again later.");
	const row = await createBugReport(user.id, input);
	// The admins hear by email after the response; a mail failure never fails the report.
	const adminUrl = `${url.origin}/admin/${input.kind === "feature" ? "feature-requests" : "bug-reports"}`;
	background(async () => {
		for (const to of await systemAdminEmails()) {
			await sendBugReportEmail({
				to,
				kind: row.kind,
				title: row.title,
				body: row.body,
				pageUrl: row.pageUrl,
				reporterName: user.name || user.email,
				reporterEmail: user.email,
				contactEmail: row.contactEmail,
				flags: row.flags ? row.flags.split(",") : [],
				adminUrl,
			});
		}
	});
	return { sent: true };
});

/** Any signed-in user gives a feature request a thumbs up or down, or takes it back (`none`); the page re-sorts by score. */
export const voteOnBug = form(BugReportVoteSchema, async ({ id, vote }) => {
	const { locals } = getRequestEvent();
	const user = requireUser(locals);
	if (await rateLimited(`vote:${user.id}`, 120, HOUR)) error(429, "Too many votes for one hour.");
	const tally = await voteOnBugReport(id, user.id, vote);
	if (!tally) error(404, "Feature request not found");
	return tally;
});

/** System admins approve a feature request for the public page, or hide it again. */
export const approveBug = form(BugReportApprovalSchema, async ({ id, approved }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	if (!(await setBugReportApproval(id, approved === "true"))) error(404, "Bug report not found");
	return { approved: approved === "true" };
});

/** System admins mark reports complete, close and reopen them on /admin; a completed feature request tells its requester when they offered an address for that. */
export const setBugStatus = form(BugReportStatusSchema, async ({ id, status }) => {
	const { locals, url } = getRequestEvent();
	requireSystemAdmin(locals);
	const row = await setBugReportStatus(id, status);
	if (!row) error(404, "Bug report not found");
	if (status === "complete" && row.kind === "feature" && row.contactEmail) {
		const to = row.contactEmail;
		background(() =>
			sendFeatureShippedEmail({ to, title: row.title, pageUrl: `${url.origin}/feature-requests` }),
		);
	}
	return { status };
});

export const setBugPriority = form(BugReportPrioritySchema, async ({ id, priority }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	if (!(await setBugReportPriority(id, priority || null))) error(404, "Bug report not found");
	return { priority: priority || null };
});

/** A written response: saved on the request (signed-in users read it on /feature-requests) and emailed to the requester. */
export const respondToBug = form(BugReportResponseSchema, async ({ id, response }) => {
	const { locals, url } = getRequestEvent();
	requireSystemAdmin(locals);
	const saved = await respondToBugReport(id, response);
	if (!saved) error(404, "Bug report not found");
	// To the address they offered for follow-up, else the account's; the reporter may be gone.
	const to = saved.contactEmail ?? saved.reporter?.email;
	if (response && to) {
		const name = saved.reporter?.name;
		background(() =>
			sendReportResponseEmail({
				to,
				name: name || null,
				kind: saved.kind,
				title: saved.title,
				response,
				pageUrl: `${url.origin}${saved.kind === "feature" ? "/feature-requests" : ""}`,
			}),
		);
	}
	return { responded: !!response };
});

export const deleteBug = form(IdSchema, async ({ id }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	if (!(await removeReport(id))) error(404, "Bug report not found");
	return { deleted: true };
});
