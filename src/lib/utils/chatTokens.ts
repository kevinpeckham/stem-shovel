/**
 * A chat message's text split into what the page renders (docs/chat.md):
 * plain runs, URLs (as links), positions written as time (`1:23`,
 * `0:45.5`, `12:03:15`) that seek the player, and `@Name` for each person
 * the message mentions ("Mentions"; any other `@text` stays plain).
 * Nothing is HTML: the page makes elements from the tokens, so no
 * sanitising is needed.
 */
export type ChatToken =
	| { kind: "text"; text: string }
	| { kind: "url"; text: string; href: string }
	| { kind: "position"; text: string; seconds: number }
	| { kind: "mention"; text: string; id: string };

type Push = (t: ChatToken) => void;

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

export function chatTokens(
	body: string,
	mentions: { id: string; name: string }[] = [],
): ChatToken[] {
	const out: ChatToken[] = [];
	const push: Push = (t) => {
		if (t.kind === "text" && !t.text) return;
		out.push(t);
	};
	// Longest names first, so "@Sam Lee" is Sam Lee and not Sam followed by " Lee".
	const named = mentions.filter((p) => p.name).toSorted((a, b) => b.name.length - a.name.length);
	const pushText = (text: string) => pushMentions(text, named, push);
	let i = 0;
	for (const m of body.matchAll(URL_RE)) {
		const href = trimUrl(m[0]);
		const at = m.index;
		pushText(body.slice(i, at));
		push({ kind: "url", text: href, href });
		i = at + href.length;
	}
	pushText(body.slice(i));
	return out;
}

/** The first `@Name` of a mentioned person in `text` from `from` on, not run on into a longer word. */
function nextMention(text: string, from: number, named: { id: string; name: string }[]) {
	let best: { at: number; id: string; text: string } | null = null;
	for (const p of named) {
		const needle = `@${p.name}`;
		for (let at = text.indexOf(needle, from); at >= 0; at = text.indexOf(needle, at + 1)) {
			const after = text[at + needle.length];
			if (after !== undefined && /[\p{L}\p{N}_]/u.test(after)) continue;
			// An earlier match wins; at the same place the longer name, which comes first.
			if (!best || at < best.at) best = { at, id: p.id, text: needle };
			break;
		}
	}
	return best;
}

function pushMentions(text: string, named: { id: string; name: string }[], push: Push) {
	let i = 0;
	for (let m = nextMention(text, 0, named); m; m = nextMention(text, i, named)) {
		pushPositions(text.slice(i, m.at), push);
		push({ kind: "mention", text: m.text, id: m.id });
		i = m.at + m.text.length;
	}
	pushPositions(text.slice(i), push);
}

function pushPositions(text: string, push: Push) {
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
