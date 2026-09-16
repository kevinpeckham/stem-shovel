import { form, getRequestEvent } from "$app/server";
import { requireSystemAdmin, requireUser } from "$lib/server/access";
import { background } from "$lib/server/background";
import { createBugReport, setBugReportStatus, systemAdminEmails } from "$lib/server/data";
import { sendBugReportEmail } from "$lib/server/email";
import { BugReportCreateSchema, BugReportStatusSchema } from "$lib/val/BugReportSchema";
import { error } from "@sveltejs/kit";

/** Any signed-in user; the page and browser come from the form's hidden fields. */
export const reportBug = form(BugReportCreateSchema, async (input) => {
	const { locals, url } = getRequestEvent();
	const user = requireUser(locals);
	const row = await createBugReport(user.id, input);
	// The admins hear by email after the response; a mail failure never fails the report.
	const adminUrl = `${url.origin}/admin#bug-reports`;
	background(async () => {
		for (const to of await systemAdminEmails()) {
			await sendBugReportEmail({
				to,
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

/** System admins close and reopen reports on /admin. */
export const setBugStatus = form(BugReportStatusSchema, async ({ id, status }) => {
	const { locals } = getRequestEvent();
	requireSystemAdmin(locals);
	if (!(await setBugReportStatus(id, status))) error(404, "Bug report not found");
	return { status };
});
