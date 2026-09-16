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

/** A new bug report, to each system admin; replies go to the reporter. */
export async function sendBugReportEmail(opts: {
	to: string;
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
			`${opts.reporterName} (${opts.reporterEmail}) reported a bug on Stem Shovel: "${opts.title}".`,
			opts.body,
			...(opts.pageUrl ? [`Page: ${opts.pageUrl}`] : []),
		],
		cta: { label: "Open the bug reports", url: opts.adminUrl },
	});
	await sendEmail({
		to: opts.to,
		subject: `Bug report: ${opts.title}`,
		replyTo: opts.reporterEmail,
		...body,
	});
}
