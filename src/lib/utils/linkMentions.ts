/** A thing a document may mention by name: `@Label` becomes a link to `href`. */
export interface MentionTarget {
	label: string;
	href: string;
}

const escapeHtml = (s: string) =>
	s
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Mentions in rendered markdown (docs/uploads-and-blob.md, "Mentions"): in
 * the text of already-sanitised HTML, `@` followed by a target's label
 * becomes `<a class="mention" href="…">@Label</a>`. Labels match literally
 * and case-insensitively (a title can have spaces), longest first, and
 * only when the label ends at the end of the text, whitespace or
 * punctuation (`@Chart` does not catch `@Charts`), and the `@` is not glued
 * to a word (an e-mail address is left alone). Tags and attributes are
 * never touched, nor the text inside an existing `<a>`; the anchor is the
 * only HTML this adds, its href and label escaped. Labels that are empty or
 * only `@` are ignored.
 */
export function linkMentions(html: string, targets: MentionTarget[]): string {
	const usable = targets
		.map((t) => ({ ...t, label: t.label.trim() }))
		.filter((t) => t.label.length > 0 && t.href.length > 0)
		.sort((a, b) => b.label.length - a.label.length);
	if (usable.length === 0 || !html.includes("@")) return html;
	// A label is matched in the text as the renderer wrote it (`&` is `&amp;` there) and as typed.
	const byKey = new Map<string, MentionTarget>();
	const alternatives: string[] = [];
	for (const t of usable) {
		for (const form of new Set([escapeHtml(t.label), t.label])) {
			const key = form.toLowerCase();
			if (byKey.has(key)) continue;
			byKey.set(key, t);
			alternatives.push(escapeRegExp(form));
		}
	}
	const pattern = new RegExp(
		`(?<![\\p{L}\\p{N}_@])@(${alternatives.join("|")})(?=$|[\\s\\p{P}\\p{S}])`,
		"giu",
	);
	const replaceText = (text: string) =>
		text.replace(pattern, (whole, matched: string) => {
			const target = byKey.get(matched.toLowerCase());
			if (!target) return whole;
			return `<a class="mention" href="${escapeHtml(target.href)}">@${escapeHtml(target.label)}</a>`;
		});

	let out = "";
	let inAnchor = 0;
	let last = 0;
	const tag = /<\/?([a-zA-Z][a-zA-Z0-9-]*)(?:\s[^>]*)?>|<!--[\s\S]*?-->/g;
	for (let m = tag.exec(html); m; m = tag.exec(html)) {
		const text = html.slice(last, m.index);
		out += inAnchor > 0 ? text : replaceText(text);
		out += m[0];
		last = m.index + m[0].length;
		if (m[1]?.toLowerCase() === "a") {
			if (m[0].startsWith("</")) inAnchor = Math.max(0, inAnchor - 1);
			else if (!m[0].endsWith("/>")) inAnchor++;
		}
	}
	const tail = html.slice(last);
	out += inAnchor > 0 ? tail : replaceText(tail);
	return out;
}
