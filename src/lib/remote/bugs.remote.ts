import { form, getRequestEvent } from "$app/server";
import { requireSystemAdmin, requireUser } from "$lib/server/access";
import { background } from "$lib/server/background";
import {
	createBugReport,
	deleteBugReport as removeReport,
	respondToBugReport,
	setBugReportPriority,
	setBugReportStatus,
	systemAdminEmails,
} from "$lib/server/data";
import { sendBugReportEmail, sendReportResponseEmail } from "$lib/server/email";
import {
	BugReportCreateSchema,
	BugReportPrioritySchema,
	BugReportResponseSchema,
	BugReportStatusSchema,
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
				adminUrl,
			});
		}
	});
	return { sent: true };
});

/** System admins mark reports complete, close and reopen them on /admin. */
export const setBugStatus = form(BugReportStatusSchema, async ({ id, status }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	if (!(await setBugReportStatus(id, status))) error(404, "Bug report not found");
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
	if (response && saved.reporter) {
		const { email, name } = saved.reporter;
		background(() =>
			sendReportResponseEmail({
				to: email,
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
