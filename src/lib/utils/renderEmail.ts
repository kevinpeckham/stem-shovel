/** What every Stem Shovel email is made of; rendered to HTML and plain text. */
export interface EmailContent {
	greeting: string;
	/** Paragraphs, plain text (escaped for HTML). */
	lines: string[];
	/** One call to action, rendered as a button and repeated as a bare link. */
	cta?: { label: string; url: string };
	/** Small print at the end. */
	footer?: string;
}

const escape = (text: string) =>
	text.replace(
		/[&<>"']/g,
		(c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
	);

/** HTML and text bodies for an email; inline styles only, as mail clients need. */
export function renderEmail(content: EmailContent): { html: string; text: string } {
	const p = (t: string) =>
		`<p style="margin:0 0 16px;font-size:16px;line-height:1.5;color:#1f2933">${escape(t)}</p>`;
	const cta = content.cta
		? `<p style="margin:24px 0"><a href="${escape(content.cta.url)}" style="display:inline-block;padding:10px 18px;border-radius:6px;background:#1f2933;color:#ebf92f;font-size:16px;text-decoration:none">${escape(content.cta.label)}</a></p>
<p style="margin:0 0 16px;font-size:13px;line-height:1.5;color:#52606d">Or open this link: <a href="${escape(content.cta.url)}" style="color:#52606d">${escape(content.cta.url)}</a></p>`
		: "";
	const footer = content.footer
		? `<p style="margin:32px 0 0;font-size:13px;line-height:1.5;color:#7b8794">${escape(content.footer)}</p>`
		: "";
	const html = `<div style="background:#ffffff;padding:32px 24px"><div style="max-width:560px;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<p style="margin:0 0 24px;font-size:14px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#52606d">Stem Shovel</p>
${p(content.greeting)}
${content.lines.map(p).join("\n")}
${cta}
${footer}
</div></div>`;
	const text = [
		content.greeting,
		"",
		...content.lines.flatMap((l) => [l, ""]),
		...(content.cta ? [`${content.cta.label}: ${content.cta.url}`, ""] : []),
		...(content.footer ? [content.footer] : []),
	]
		.join("\n")
		.trim();
	return { html, text };
}
