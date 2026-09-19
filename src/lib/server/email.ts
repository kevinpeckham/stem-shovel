import { renderEmail } from "$lib/utils/renderEmail";
import { Resend } from "resend";
import { ENV } from "varlock/env";

/**
 * Transactional email through Resend, following replicator's
 * email.server.ts. Everything goes out as no-reply@<RESEND_MAIL_DOMAIN>
 * (the domain is verified in Resend); replies, where they make sense, go to
 * the person who triggered the mail.
 */
const from = (name = "Stem Shovel") => `${name} <no-reply@${ENV.RESEND_MAIL_DOMAIN}>`;

/** Header-safe: no line breaks, no angle brackets, bounded length. */
const headerSafe = (s: string) =>
	s
		.replace(/[\r\n<>]/g, " ")
		.trim()
		.slice(0, 120);

async function sendEmail(options: {
	to: string;
	subject: string;
	html: string;
	text: string;
	from?: string;
	replyTo?: string;
}): Promise<{ id: string }> {
	if (!ENV.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");
	const resend = new Resend(ENV.RESEND_API_KEY);
	const { data, error } = await resend.emails.send({
		from: options.from ?? from(),
		to: options.to,
		subject: headerSafe(options.subject),
		html: options.html,
		text: options.text,
		...(options.replyTo ? { replyTo: options.replyTo } : {}),
	});
	if (error) {
		console.error("[email]", error);
		throw new Error(error.message);
	}
	return { id: data?.id ?? "" };
}

const greet = (name?: string) => (name ? `Hi ${name},` : "Hi,");

export async function sendVerificationEmail(to: string, url: string, name?: string) {
	const body = renderEmail({
		greeting: greet(name),
		lines: ["Confirm this is your address and you are in."],
		cta: { label: "Verify email", url },
		footer: "If you did not create a Stem Shovel account, ignore this email.",
	});
	await sendEmail({ to, subject: "Verify your email for Stem Shovel", ...body });
}

export async function sendPasswordResetEmail(to: string, url: string, name?: string) {
	const body = renderEmail({
		greeting: greet(name),
		lines: [
			"Someone asked to reset the password for this account. The link works once and expires in an hour.",
		],
		cta: { label: "Choose a new password", url },
		footer: "If that was not you, ignore this email; your password stays as it is.",
	});
	await sendEmail({ to, subject: "Reset your Stem Shovel password", ...body });
}

export async function sendInvitationEmail(opts: {
	to: string;
	url: string;
	accountName: string;
	inviterName: string;
	inviterEmail: string;
	role: string;
}) {
	const body = renderEmail({
		greeting: "Hi,",
		lines: [
			`${opts.inviterName} invited you to join "${opts.accountName}" on Stem Shovel as ${opts.role === "admin" ? "an admin" : `a ${opts.role}`}.`,
			"Stem Shovel is where the band's projects, songs and stems live. Accept the invitation with the address this email reached, signing up first if you are new.",
		],
		cta: { label: `Join ${opts.accountName}`, url: opts.url },
		footer: "The invitation expires in 14 days. If you were not expecting it, ignore this email.",
	});
	await sendEmail({
		to: opts.to,
		subject: `${opts.inviterName} invited you to ${opts.accountName} on Stem Shovel`,
		from: from(`${headerSafe(opts.inviterName)} via Stem Shovel`),
		replyTo: opts.inviterEmail,
		...body,
	});
}

export async function sendShareEmail(opts: {
	to: string;
	url: string;
	songTitle: string;
	projectName: string;
	senderName: string;
	senderEmail: string;
	message: string;
}) {
	const body = renderEmail({
		greeting: "Hi,",
		lines: [
			`${opts.senderName} shared "${opts.songTitle}" (from ${opts.projectName}) with you on Stem Shovel.`,
			...(opts.message ? [opts.message] : []),
			"Anyone with the link can listen to the stems, read the chart and lyrics, and download the mixes.",
		],
		cta: { label: `Open ${opts.songTitle}`, url: opts.url },
	});
	await sendEmail({
		to: opts.to,
		subject: `${opts.senderName} shared "${opts.songTitle}" with you`,
		from: from(`${headerSafe(opts.senderName)} via Stem Shovel`),
		replyTo: opts.senderEmail,
		...body,
	});
}

/** The waitlist's double opt-in: nothing is kept as confirmed until this link is opened. */
export async function sendWaitlistConfirmEmail(opts: {
	to: string;
	name: string;
	confirmUrl: string;
	manageUrl: string;
	updatesOk: boolean;
}) {
	const body = renderEmail({
		greeting: greet(opts.name),
		lines: [
			"You asked to join the Stem Shovel beta waitlist. Confirm your address and you are on it; invite codes go out to the list as we open more seats.",
			opts.updatesOk
				? "You also said yes to project updates (a note now and then about what is new). Change your mind any time from the link at the end of this email."
				: "You will only hear from us about the waitlist itself — your confirmation and your invite. If you would like project updates too, the link at the end of this email turns them on.",
		],
		cta: { label: "Confirm my address", url: opts.confirmUrl },
		footer: `Not you? Ignore this email and nothing happens. Manage your waitlist entry or leave the list: ${opts.manageUrl}`,
	});
	await sendEmail({ to: opts.to, subject: "Confirm your Stem Shovel waitlist address", ...body });
}

/** The invite: a code that opens sign-up, single-use, with its expiry. */
export async function sendWaitlistInviteEmail(opts: {
	to: string;
	name: string;
	code: string;
	signUpUrl: string;
	manageUrl: string;
	expiresDays: number;
}) {
	const body = renderEmail({
		greeting: greet(opts.name),
		lines: [
			"Your Stem Shovel invite is here. The code below opens sign-up; it works once.",
			`Invite code: ${opts.code}`,
			`It expires in ${opts.expiresDays} days. Sign up with the address this email reached and you get a workspace of your own.`,
		],
		cta: { label: "Sign up with this code", url: opts.signUpUrl },
		footer: `Manage your waitlist entry: ${opts.manageUrl}`,
	});
	await sendEmail({ to: opts.to, subject: "Your Stem Shovel invite code", ...body });
}

/** Two-factor switched on or off: the user hears, in case it was not them. */
export async function sendTwoFactorChangedEmail(to: string, name: string, enabled: boolean) {
	const body = renderEmail({
		greeting: `Hi ${name || "there"},`,
		lines: enabled
			? [
					"Two-factor authentication is now on for your Stem Shovel account. From now on, signing in asks for a code from your authenticator app (or one of your backup codes).",
					"If this was not you, reset your password right away.",
				]
			: [
					"Two-factor authentication has been switched off for your Stem Shovel account. Signing in now needs your password alone.",
					"If this was not you, reset your password right away and turn two-factor back on from Security in the account menu.",
				],
		cta: { label: "Security settings", url: "https://www.stemshovel.com/settings/security" },
	});
	await sendEmail({
		to,
		subject: enabled ? "Two-factor authentication is on" : "Two-factor authentication is off",
		...body,
	});
}

/** A new bug report or feature request, to each system admin; replies go to the reporter. */
export async function sendSupportRequestEmail(opts: {
	to: string;
	email: string;
	senderName: string | null;
	accountName: string | null;
	message: string;
	verifiedBy: string;
	adminUrl: string;
}) {
	const who = opts.senderName ? `${opts.senderName} (${opts.email})` : opts.email;
	const body = renderEmail({
		greeting: "Hi,",
		lines: [
			`${who} asked for help on Stem Shovel${opts.accountName ? ` (account: ${opts.accountName})` : ""}, verified by ${opts.verifiedBy}.`,
			opts.message,
		],
		cta: { label: "Open the support requests", url: opts.adminUrl },
	});
	await sendEmail({
		to: opts.to,
		subject: `Support request from ${opts.email}`,
		replyTo: opts.email,
		...body,
	});
}

export async function sendBugReportEmail(opts: {
	to: string;
	kind: "bug" | "feature";
	title: string;
	body: string;
	pageUrl: string;
	reporterName: string;
	reporterEmail: string;
	adminUrl: string;
}) {
	const body = renderEmail({
		greeting: "Hi,",
		lines: [
			`${opts.reporterName} (${opts.reporterEmail}) ${opts.kind === "feature" ? "requested a feature on" : "reported a bug on"} Stem Shovel: "${opts.title}".`,
			opts.body,
			...(opts.pageUrl ? [`Page: ${opts.pageUrl}`] : []),
		],
		cta: {
			label: opts.kind === "feature" ? "Open the feature requests" : "Open the bug reports",
			url: opts.adminUrl,
		},
	});
	await sendEmail({
		to: opts.to,
		subject: `${opts.kind === "feature" ? "Feature request" : "Bug report"}: ${opts.title}`,
		replyTo: opts.reporterEmail,
		...body,
	});
}
