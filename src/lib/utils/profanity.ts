/**
 * Words that flag a feature request or bug report for a look before it is
 * approved for the public page (src/lib/remote/bugs.remote.ts). A short,
 * plain list matched on word boundaries, so "assess" and "Scunthorpe" pass;
 * it is a tripwire for an admin, not a filter, and nothing is refused.
 */
const WORDS = [
	"ass",
	"asshole",
	"bastard",
	"bitch",
	"bollocks",
	"bullshit",
	"cock",
	"crap",
	"cunt",
	"damn",
	"dick",
	"dickhead",
	"fag",
	"faggot",
	"fuck",
	"fucked",
	"fucker",
	"fucking",
	"goddamn",
	"jackass",
	"motherfucker",
	"nigga",
	"nigger",
	"piss",
	"prick",
	"pussy",
	"retard",
	"retarded",
	"shit",
	"shitty",
	"slut",
	"twat",
	"wanker",
	"whore",
];
const PATTERN = new RegExp(`\\b(${WORDS.join("|")})\\b`, "gi");

/** The flagged words found in the text, lowercased and de-duplicated, in order of first appearance. */
export function flagProfanity(text: string): string[] {
	const found: string[] = [];
	for (const m of text.matchAll(PATTERN)) {
		const w = m[1].toLowerCase();
		if (!found.includes(w)) found.push(w);
	}
	return found;
}
