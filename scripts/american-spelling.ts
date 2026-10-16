/**
 * American spelling in copy (Kevin, 2026-10-16: "always choose the American
 * spelling, when there is a choice"): finds UK spellings from the table in
 * src/lib/utils/americanSpelling.ts where a user could read them, and with
 * --apply rewrites them. Copy means: string literals and comments in .ts,
 * .js and the <script> of .svelte files; text nodes, label-like attributes
 * (title, aria-label, placeholder, alt, label, description) and the strings
 * inside {expressions} in Svelte markup; prose outside code in markdown
 * (user docs, docs, README). Identifiers, object keys, props, CSS classes,
 * paths and anything in backticks are left alone: a string with no space
 * that looks like a path or an id is skipped too.
 *
 *   bun run spell:us            report (exit 1 when something is found)
 *   bun run spell:us --apply    rewrite
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { americanize, ukWordsIn } from "../src/lib/utils/americanSpelling";

const apply = process.argv.includes("--apply");
const ROOTS = ["src", "scripts/user-docs", "docs", "README.md"];
const SKIP_DIRS = new Set(["node_modules", ".svelte-kit", "notation-samples"]);
/** The table itself and its test say the UK words on purpose. */
const SKIP_FILES = new Set([
	"src/lib/utils/americanSpelling.ts",
	"src/lib/utils/americanSpelling.test.ts",
	"scripts/american-spelling.ts",
]);
const LABEL_ATTRS = [
	"title",
	"aria-label",
	"placeholder",
	"alt",
	"label",
	"aria-description",
	"description",
	"hint",
];
/** Marks around a template literal's `${…}` while its text is being fixed. */
const EXPR_OPEN = "\uE000";
const EXPR_CLOSE = "\uE001";

function* files(path: string): Generator<string> {
	const st = statSync(path);
	if (st.isDirectory()) {
		if (SKIP_DIRS.has(path.split("/").pop()!)) return;
		for (const name of readdirSync(path)) yield* files(join(path, name));
	} else if (/\.(ts|js|svelte|md)$/.test(path) && !path.endsWith(".d.ts") && !SKIP_FILES.has(path))
		yield path;
}

/**
 * A string literal's contents are copy when they read as prose: words with
 * spaces, or a single capitalised word (a notice like "Cancelled"). A single
 * lowercase word is a value or a key ("minimised" as a panel mode, a storage
 * key, a class), never touched, whatever it is spelled like.
 */
function isCopyString(s: string): boolean {
	if (!/[a-zA-Z]/.test(s)) return false;
	if (!s.includes(" ")) return /^[A-Z][a-z]+$/.test(s);
	return true;
}

function fixComment(text: string): string {
	return text
		.split(/(`[^`\n]*`)/)
		.map((part) => (part.startsWith("`") ? part : americanize(part)))
		.join("");
}

/** Code: strings and comments, backtick spans in comments and `${}` in templates skipped. */
function fixCode(src: string): string {
	let out = "";
	let i = 0;
	const n = src.length;
	while (i < n) {
		const c = src[i]!;
		const next = src[i + 1];
		if (c === "/" && next === "/") {
			const end = src.indexOf("\n", i);
			const stop = end === -1 ? n : end;
			out += fixComment(src.slice(i, stop));
			i = stop;
		} else if (c === "/" && next === "*") {
			const end = src.indexOf("*/", i + 2);
			const stop = end === -1 ? n : end + 2;
			out += fixComment(src.slice(i, stop));
			i = stop;
		} else if (c === '"' || c === "'") {
			let j = i + 1;
			while (j < n && src[j] !== c) {
				if (src[j] === "\\") j++;
				if (src[j] === "\n") break;
				j++;
			}
			const body = src.slice(i + 1, j);
			out += c + (isCopyString(body) ? americanize(body) : body) + (src[j] === c ? c : "");
			i = src[j] === c ? j + 1 : j;
		} else if (c === "`") {
			let j = i + 1;
			let body = "";
			while (j < n && src[j] !== "`") {
				if (src[j] === "\\") {
					body += src.slice(j, j + 2);
					j += 2;
					continue;
				}
				if (src[j] === "$" && src[j + 1] === "{") {
					let depth = 1;
					let k = j + 2;
					while (k < n && depth > 0) {
						if (src[k] === "{") depth++;
						else if (src[k] === "}") depth--;
						k++;
					}
					body += EXPR_OPEN + fixCode(src.slice(j + 2, k - 1)) + EXPR_CLOSE;
					j = k;
					continue;
				}
				body += src[j];
				j++;
			}
			const fixed = body
				.split(new RegExp(`(${EXPR_OPEN}[\\s\\S]*?${EXPR_CLOSE})`))
				.map((part) =>
					part.startsWith(EXPR_OPEN)
						? "${" + part.slice(1, -1) + "}"
						: isCopyString(part)
							? americanize(part)
							: part,
				)
				.join("");
			out += "`" + fixed + (src[j] === "`" ? "`" : "");
			i = src[j] === "`" ? j + 1 : j;
		} else {
			out += c;
			i++;
		}
	}
	return out;
}

/** Markdown: prose outside fenced blocks, inline code, and link targets. */
function fixMarkdown(src: string): string {
	return src
		.split(/(```[\s\S]*?```)/)
		.map((block) =>
			block.startsWith("```")
				? block
				: block
						.split(/(`[^`\n]*`|\]\([^)]*\))/)
						.map((part) =>
							part.startsWith("`") || part.startsWith("](") ? part : americanize(part),
						)
						.join(""),
		)
		.join("");
}

function fixMarkup(src: string): string {
	let out = "";
	let i = 0;
	const n = src.length;
	const attrPattern = new RegExp(`\\b(${LABEL_ATTRS.join("|")})=("[^"]*"|'[^']*')`, "g");
	while (i < n) {
		const c = src[i]!;
		if (c === "<") {
			// A tag: label attributes' values; everything else as is.
			let j = i + 1;
			let quote: string | null = null;
			let depth = 0;
			while (j < n) {
				const d = src[j]!;
				if (quote) {
					if (d === quote) quote = null;
				} else if (d === "{") depth++;
				else if (d === "}") depth--;
				else if ((d === '"' || d === "'") && depth === 0) quote = d;
				else if (d === ">" && depth === 0) break;
				j++;
			}
			out += src
				.slice(i, j + 1)
				.replace(
					attrPattern,
					(_m, name: string, value: string) =>
						`${name}=${value[0]}${americanize(value.slice(1, -1))}${value[0]}`,
				);
			i = j + 1;
		} else if (c === "{") {
			let depth = 1;
			let j = i + 1;
			while (j < n && depth > 0) {
				if (src[j] === "{") depth++;
				else if (src[j] === "}") depth--;
				j++;
			}
			out += "{" + fixCode(src.slice(i + 1, j - 1)) + "}";
			i = j;
		} else {
			let j = i;
			while (j < n && src[j] !== "<" && src[j] !== "{") j++;
			out += americanize(src.slice(i, j));
			i = j;
		}
	}
	return out;
}

/** Svelte: the script as code, the style untouched, the markup's text, label attributes and expression strings. */
function fixSvelte(src: string): string {
	return src
		.split(/(<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->)/)
		.map((part) => {
			if (part.startsWith("<style")) return part;
			if (part.startsWith("<!--")) return fixComment(part);
			if (part.startsWith("<script")) {
				const open = part.indexOf(">") + 1;
				const close = part.lastIndexOf("</script>");
				return part.slice(0, open) + fixCode(part.slice(open, close)) + part.slice(close);
			}
			return fixMarkup(part);
		})
		.join("");
}

let found = 0;
for (const root of ROOTS)
	for (const file of files(root)) {
		const before = readFileSync(file, "utf8");
		const after = file.endsWith(".md")
			? fixMarkdown(before)
			: file.endsWith(".svelte")
				? fixSvelte(before)
				: fixCode(before);
		if (after === before) continue;
		const lines = before.split("\n");
		const fixedLines = after.split("\n");
		for (let k = 0; k < lines.length; k++)
			if (lines[k] !== fixedLines[k]) {
				found++;
				console.log(`${file}:${k + 1}: ${ukWordsIn(lines[k]!).join(", ")}`);
			}
		if (apply) writeFileSync(file, after);
	}
console.log(
	found
		? `${found} line${found === 1 ? "" : "s"} ${apply ? "rewritten" : "with UK spellings (run with --apply to rewrite)"}`
		: "No UK spellings in copy.",
);
if (found && !apply) process.exit(1);
