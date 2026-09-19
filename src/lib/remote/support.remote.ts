import { form, getRequestEvent } from "$app/server";
import { requireSystemAdmin } from "$lib/server/access";
import { background } from "$lib/server/background";
import {
	createSupportRequest,
	deleteSupportRequest as removeRequest,
	setSupportRequestStatus,
	systemAdminEmails,
	userAccountsByEmail,
} from "$lib/server/data";
import { sendSupportRequestEmail } from "$lib/server/email";
import { HOUR, rateLimited } from "$lib/server/rateLimit";
import { openChallenge, sealChallenge } from "$lib/server/supportChallenge";
import { fakeAccountNames } from "$lib/utils/fakeAccountNames";
import { obscureName } from "$lib/utils/obscureName";
import { IdSchema } from "$lib/val/SongSchema";
import {
	SupportRequestStatusSchema,
	SupportSignedInSchema,
	SupportStartSchema,
	SupportSubmitSchema,
} from "$lib/val/SupportRequestSchema";
import { error, invalid } from "@sveltejs/kit";

/**
 * /support, open to signed-out visitors (the trouble may be sign-in). Two
 * steps prove the email is an account's without telling anyone which
 * account an email belongs to: the visitor gives the email and gets a
 * line-up of five obscured account names, four made up and one theirs when
 * the email is registered (five made up when it is not; the page cannot
 * tell the cases apart), then picks theirs and writes the message. The
 * answer travels in a sealed token (src/lib/server/supportChallenge.ts).
 * Rate limits by address and by email keep guessing slow: five picks an
 * hour on an email is a one-in-five shot each. A signed-in user skips the
 * line-up.
 */
const LINE_UP = 5;

export const startSupport = form(SupportStartSchema, async ({ email, website }) => {
	const { getClientAddress } = getRequestEvent();
	if (website) error(400, "That request was not valid."); // the honeypot
	if (
		rateLimited(`support-start:${getClientAddress()}`, 20, HOUR) ||
		rateLimited(`support-start:${email}`, 8, HOUR)
	) {
		error(429, "Too many attempts for now; try again in a while.");
	}
	const found = await userAccountsByEmail(email);
	const real =
		found?.isActive && found.accounts.length
			? found.accounts[Math.floor(Math.random() * found.accounts.length)]
			: null;
	const fakes = fakeAccountNames(real ? LINE_UP - 1 : LINE_UP, real?.name ?? "").map(obscureName);
	const options = real ? [...fakes] : fakes;
	let correct = -1;
	if (real) {
		correct = Math.floor(Math.random() * LINE_UP);
		options.splice(correct, 0, obscureName(real.name));
	}
	return {
		options,
		challenge: sealChallenge({
			email,
			options,
			correct,
			accountId: real?.id ?? null,
			userId: real ? found!.id : null,
		}),
	};
});

async function notifyAdmins(
	row: { id: string; email: string; message: string; verifiedBy: string },
	senderName: string | null,
	accountName: string | null,
) {
	const { url } = getRequestEvent();
	const adminUrl = `${url.origin}/admin/support-requests`;
	background(async () => {
		for (const to of await systemAdminEmails()) {
			await sendSupportRequestEmail({
				to,
				email: row.email,
				senderName,
				accountName,
				message: row.message,
				verifiedBy: row.verifiedBy,
				adminUrl,
			});
		}
	});
}

export const submitSupport = form(
	SupportSubmitSchema,
	async ({ email, challenge, pick, message, website }, issue) => {
		const { getClientAddress, request } = getRequestEvent();
		if (website) error(400, "That request was not valid.");
		if (
			rateLimited(`support-pick:${getClientAddress()}`, 20, HOUR) ||
			rateLimited(`support-pick:${email}`, 5, HOUR)
		) {
			error(429, "Too many attempts for now; try again in a while.");
		}
		const c = openChallenge(challenge);
		if (!c || c.email !== email) {
			invalid(issue.email("Start again: that check has expired."));
		}
		if (c.correct < 0 || Number(pick) !== c.correct) {
			invalid(
				issue.pick(
					"That did not match. Check the email address, then choose the account you belong to.",
				),
			);
		}
		const row = await createSupportRequest({
			email,
			userId: c.userId,
			accountId: c.accountId,
			message,
			verifiedBy: "challenge",
			ipAddress: getClientAddress(),
			userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? "",
		});
		await notifyAdmins(row, null, null);
		return { sent: true };
	},
);

/** A signed-in user: no line-up, the account is on record. */
export const submitSupportSignedIn = form(SupportSignedInSchema, async ({ message, website }) => {
	const { locals, getClientAddress, request } = getRequestEvent();
	const user = locals.user;
	if (!user) error(401, "Sign in, or use the form for visitors.");
	if (website) error(400, "That request was not valid.");
	if (rateLimited(`support-user:${user.id}`, 5, HOUR))
		error(429, "That is a lot of requests for one hour; try again later.");
	const account = locals.memberships[0] ?? null;
	const row = await createSupportRequest({
		email: user.email,
		userId: user.id,
		accountId: account?.accountId ?? null,
		message,
		verifiedBy: "signed-in",
		ipAddress: getClientAddress(),
		userAgent: request.headers.get("user-agent")?.slice(0, 300) ?? "",
	});
	await notifyAdmins(row, user.name || null, account?.name ?? null);
	return { sent: true };
});

/** System admins close, reopen and delete requests on /admin. */
export const setSupportStatus = form(SupportRequestStatusSchema, async ({ id, status }) => {
	requireSystemAdmin(getRequestEvent().locals);
	if (!(await setSupportRequestStatus(id, status))) error(404, "Request not found");
	return { status };
});

export const deleteSupportRequest = form(IdSchema, async ({ id }) => {
	requireSystemAdmin(getRequestEvent().locals);
	if (!(await removeRequest(id))) error(404, "Request not found");
	return { deleted: true };
});
