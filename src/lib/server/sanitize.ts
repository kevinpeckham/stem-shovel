import { type DefaultTreeAdapterTypes as T, parseFragment, serialize } from "parse5";

/**
 * Allowlist HTML sanitizer for markdown output, built on parse5 (ESM).
 *
 * Why not a library: DOMPurify's server build needs jsdom and sanitize-html
 * is CommonJS, and both dragged CommonJS→ESM `require()` chains into the
 * Vercel function, which its runtime refused at cold start. Server code here
 * stays ESM-only. The allowlist is what marked (GFM) + marked-footnote emit,
 * nothing more; unknown elements are unwrapped (text kept), a few are
 * dropped with their content, and every URL attribute is scheme-checked.
 */

const ALLOWED = new Set([
	"a",
	"abbr",
	"b",
	"blockquote",
	"br",
	"code",
	"dd",
	"del",
	"div",
	"dl",
	"dt",
	"em",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"hr",
	"i",
	"img",
	"input",
	"ins",
	"kbd",
	"li",
	"mark",
	"ol",
	"p",
	"pre",
	"s",
	"section",
	"small",
	"span",
	"strong",
	"sub",
	"sup",
	"table",
	"tbody",
	"td",
	"tfoot",
	"th",
	"thead",
	"tr",
	"u",
	"ul",
]);

/** Removed together with everything inside them. */
const DROP_WITH_CONTENT = new Set([
	"script",
	"style",
	"template",
	"iframe",
	"object",
	"embed",
	"svg",
	"math",
	"noscript",
	"form",
	"button",
	"select",
	"textarea",
	"link",
	"meta",
	"base",
	"head",
	"title",
]);

const GLOBAL_ATTRS = new Set([
	"class",
	"title",
	"data-footnote-ref",
	"data-footnotes",
	"data-footnote-backref",
]);
const ATTRS: Record<string, Set<string>> = {
	a: new Set(["href", "name"]),
	img: new Set(["src", "alt", "width", "height"]),
	input: new Set(["type", "checked", "disabled"]),
	td: new Set(["align"]),
	th: new Set(["align"]),
	ol: new Set(["start"]),
};
const URL_ATTRS = new Set(["href", "src"]);
/** Only footnote anchors may carry an id; anything else invites DOM clobbering. */
const ID_PATTERN = /^footnote-[\w-]+$/;

function safeUrl(value: string): boolean {
	const v = value.trim();
	if (v === "" || v.startsWith("#") || v.startsWith("/") || v.startsWith("./")) return true;
	// A scheme must be one of these. The regex needs a clean scheme token, so
	// obfuscations (control characters, whitespace inside "javascript") do not
	// match a scheme; those fall through and are rejected if they hold any
	// character that cannot appear in a plain relative path.
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
	if (!scheme) return !/[\s\p{Cc}:]/u.test(v);
	return scheme === "http" || scheme === "https" || scheme === "mailto" || scheme === "tel";
}

function isElement(node: T.Node): node is T.Element {
	return "tagName" in node;
}

function clean(parent: T.ParentNode): void {
	const kept: T.ChildNode[] = [];
	for (const node of parent.childNodes) {
		if (node.nodeName === "#text") {
			kept.push(node);
			continue;
		}
		if (!isElement(node)) continue; // comments, doctype, etc.
		const tag = node.tagName.toLowerCase();
		if (DROP_WITH_CONTENT.has(tag)) continue;
		if (!ALLOWED.has(tag)) {
			// Unwrap: keep the children, lose the element.
			clean(node);
			for (const child of node.childNodes) {
				child.parentNode = parent;
				kept.push(child);
			}
			continue;
		}
		const allowed = ATTRS[tag];
		node.attrs = node.attrs.filter((a) => {
			const name = a.name.toLowerCase();
			if (name === "id") return ID_PATTERN.test(a.value);
			if (URL_ATTRS.has(name)) return (allowed?.has(name) ?? false) && safeUrl(a.value);
			if (tag === "input" && name === "type") return a.value === "checkbox";
			return GLOBAL_ATTRS.has(name) || (allowed?.has(name) ?? false);
		});
		// Task-list boxes are display only.
		if (tag === "input" && !node.attrs.some((a) => a.name === "disabled")) {
			node.attrs.push({ name: "disabled", value: "" });
		}
		clean(node);
		kept.push(node);
	}
	parent.childNodes = kept;
}

/** Returns sanitized HTML; text and attribute values are escaped by parse5's serializer. */
export function sanitizeHtml(html: string): string {
	const fragment = parseFragment(html);
	clean(fragment);
	return serialize(fragment);
}
