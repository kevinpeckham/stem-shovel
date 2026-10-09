/**
 * A chat message's text split into what the page renders (docs/chat.md):
 * plain runs, URLs (as links) and positions written as time (`1:23`,
 * `0:45.5`, `12:03:15`) that seek the player. Nothing is HTML: the page
 * makes elements from the tokens, so no sanitising is needed.
 */
export type ChatToken =
	| { kind: "text"; text: string }
	| { kind: "url"; text: string; href: string }
	| { kind: "position"; text: string; seconds: number };

const URL_RE = /https?:\/\/[^\s<>"']+/gi;
/** m:ss, m:ss.s or h:mm:ss, with up to two digits before the first colon and none joined to a word. */
const POSITION_RE = /(?<![\w:.])(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\.(\d+))?(?![\w:])/g;

/** Seconds of a matched position: h:mm:ss when three parts, else m:ss, with any decimal part. */
function secondsOf(a: string, b: string, c: string | undefined, frac: string | undefined) {
	const parts = c === undefined ? [Number(a), Number(b)] : [Number(a), Number(b), Number(c)];
	if (parts.some((p, i) => i > 0 && p >= 60)) return null;
	const whole = parts.reduce((acc, p) => acc * 60 + p, 0);
	return whole + (frac ? Number(`0.${frac}`) : 0);
}

/** Trailing punctuation a sentence hangs on a URL is not part of it. */
function trimUrl(raw: string) {
	let url = raw;
	while (/[.,;:!?)\]]$/.test(url)) {
		if (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) >= (url.match(/\)/g)?.length ?? 0))
			break;
		url = url.slice(0, -1);
	}
	return url;
}

export function chatTokens(body: string): ChatToken[] {
	const out: ChatToken[] = [];
	const push = (t: ChatToken) => {
		if (t.kind === "text" && !t.text) return;
		out.push(t);
	};
	let i = 0;
	for (const m of body.matchAll(URL_RE)) {
		const href = trimUrl(m[0]);
		const at = m.index;
		pushPositions(body.slice(i, at), push);
		push({ kind: "url", text: href, href });
		i = at + href.length;
	}
	pushPositions(body.slice(i), push);
	return out;
}

function pushPositions(text: string, push: (t: ChatToken) => void) {
	let i = 0;
	for (const m of text.matchAll(POSITION_RE)) {
		const seconds = secondsOf(m[1], m[2], m[3], m[4]);
		if (seconds === null) continue;
		push({ kind: "text", text: text.slice(i, m.index) });
		push({ kind: "position", text: m[0], seconds });
		i = m.index + m[0].length;
	}
	push({ kind: "text", text: text.slice(i) });
}
