/**
 * A MusicXML score as the few lines a model needs to know the keys and
 * the chords of a song (docs/audio-engine.md, "The score as the AI's
 * chart"): per measure of the first part that carries harmony (else the
 * first part), the key signature where it changes, the time signature,
 * tempo marks, rehearsal marks and words ("Chorus"), repeats and endings,
 * and the chord symbols in order. A plain text scan, no XML parser: the
 * elements it reads are regular, and the whole XML never leaves the
 * server. Cut at `maxChars` with a final line saying so.
 */
export function musicXmlSummary(xml: string, maxChars = 12_000): string {
	const parts = [...xml.matchAll(/<part\b[^>]*\bid="([^"]+)"[^>]*>([\s\S]*?)<\/part>/g)];
	if (parts.length === 0) return "";
	const names = new Map(
		[
			...xml.matchAll(
				/<score-part\b[^>]*\bid="([^"]+)"[^>]*>[\s\S]*?<part-name>([^<]*)<\/part-name>/g,
			),
		].map((m) => [m[1]!, decode(m[2]!.trim())]),
	);
	const chosen = parts.find((p) => /<harmony\b/.test(p[2]!)) ?? parts[0]!;
	const lines: string[] = [];
	const title = decode(xml.match(/<(?:work-title|movement-title)>([^<]*)</)?.[1]?.trim() ?? "");
	if (title) lines.push(`Title: ${title}`);
	lines.push(
		`Part: ${names.get(chosen[1]!) ?? chosen[1]} (${parts.length} part${parts.length === 1 ? "" : "s"})`,
	);
	for (const m of chosen[2]!.matchAll(/<measure\b([^>]*)>([\s\S]*?)<\/measure>/g)) {
		const number = m[1]!.match(/\bnumber="([^"]+)"/)?.[1] ?? "?";
		const body = m[2]!;
		const marks: string[] = [];
		const fifths = body.match(/<key\b[^>]*>[\s\S]*?<fifths>(-?\d+)<\/fifths>/)?.[1];
		if (fifths !== undefined) {
			const mode = body.match(/<key\b[^>]*>[\s\S]*?<mode>([^<]*)<\/mode>/)?.[1] ?? "major";
			marks.push(`key ${keyName(Number(fifths), mode)}`);
		}
		const time = body.match(
			/<time\b[^>]*>[\s\S]*?<beats>(\d+)<\/beats>[\s\S]*?<beat-type>(\d+)<\/beat-type>/,
		);
		if (time) marks.push(`${time[1]}/${time[2]}`);
		for (const t of body.matchAll(/<sound\b[^>]*\btempo="([^"]+)"/g)) marks.push(`tempo ${t[1]}`);
		for (const r of body.matchAll(/<rehearsal\b[^>]*>([^<]*)</g)) marks.push(`[${decode(r[1]!)}]`);
		for (const w of body.matchAll(/<words\b[^>]*>([^<]*)</g)) {
			const text = decode(w[1]!).trim();
			if (text) marks.push(`"${text}"`);
		}
		for (const r of body.matchAll(/<repeat\b[^>]*\bdirection="([^"]+)"/g))
			marks.push(r[1] === "forward" ? "|:" : ":|");
		for (const e of body.matchAll(/<ending\b[^>]*\bnumber="([^"]+)"[^>]*\btype="start"/g))
			marks.push(`ending ${e[1]}`);
		for (const s of body.matchAll(/<(segno|coda|fine)\b/g)) marks.push(s[1]!);
		const chords = [...body.matchAll(/<harmony\b[\s\S]*?<\/harmony>/g)].map((h) => chordName(h[0]));
		if (marks.length === 0 && chords.length === 0) continue;
		lines.push(
			`m${number}${marks.length ? ` ${marks.join(" ")}` : ""}${chords.length ? `: ${chords.join(" ")}` : ""}`,
		);
	}
	let text = lines.join("\n");
	if (text.length > maxChars) text = `${text.slice(0, maxChars)}\n… (the score goes on)`;
	return text;
}

const MAJORS = ["C♭", "G♭", "D♭", "A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯"];
const MINORS = ["A♭", "E♭", "B♭", "F", "C", "G", "D", "A", "E", "B", "F♯", "C♯", "G♯", "D♯", "A♯"];

/** A key signature as "E♭ major" or "C minor" (fifths −7 to 7; other modes named as such). */
export function keyName(fifths: number, mode = "major"): string {
	const i = Math.max(0, Math.min(14, fifths + 7));
	if (mode === "minor") return `${MINORS[i]} minor`;
	const major = MAJORS[i]!;
	return mode === "major" || !mode ? `${major} major` : `${major} ${mode}`;
}

const KINDS: Record<string, string> = {
	major: "",
	minor: "m",
	augmented: "+",
	diminished: "dim",
	dominant: "7",
	"major-seventh": "maj7",
	"minor-seventh": "m7",
	"diminished-seventh": "dim7",
	"augmented-seventh": "+7",
	"half-diminished": "m7♭5",
	"major-minor": "mMaj7",
	"major-sixth": "6",
	"minor-sixth": "m6",
	"dominant-ninth": "9",
	"major-ninth": "maj9",
	"minor-ninth": "m9",
	"dominant-11th": "11",
	"major-11th": "maj11",
	"minor-11th": "m11",
	"dominant-13th": "13",
	"major-13th": "maj13",
	"minor-13th": "m13",
	"suspended-second": "sus2",
	"suspended-fourth": "sus4",
	power: "5",
	none: "N.C.",
};

function chordName(harmony: string): string {
	const step = harmony.match(/<root-step>([A-G])<\/root-step>/)?.[1];
	const alter = Number(harmony.match(/<root-alter>(-?\d+)<\/root-alter>/)?.[1] ?? 0);
	const kindEl = harmony.match(/<kind\b([^>]*)>([^<]*)<\/kind>/);
	const kindText = kindEl?.[1]?.match(/\btext="([^"]*)"/)?.[1];
	const kind = kindText !== undefined ? decode(kindText) : (KINDS[kindEl?.[2]?.trim() ?? ""] ?? "");
	if (!step) return kind === "N.C." ? kind : "?";
	const degrees = [...harmony.matchAll(/<degree\b[\s\S]*?<\/degree>/g)]
		.map((d) => {
			const value = d[0].match(/<degree-value>(\d+)</)?.[1] ?? "";
			const a = Number(d[0].match(/<degree-alter>(-?\d+)</)?.[1] ?? 0);
			const type = d[0].match(/<degree-type>([^<]*)</)?.[1] ?? "add";
			return `${type === "subtract" ? "no" : type === "add" ? "add" : ""}${accidental(a)}${value}`;
		})
		.join("");
	const bassStep = harmony.match(/<bass-step>([A-G])<\/bass-step>/)?.[1];
	const bassAlter = Number(harmony.match(/<bass-alter>(-?\d+)<\/bass-alter>/)?.[1] ?? 0);
	return `${step}${accidental(alter)}${kind}${degrees}${bassStep ? `/${bassStep}${accidental(bassAlter)}` : ""}`;
}

const accidental = (alter: number) =>
	alter > 0 ? "♯".repeat(alter) : alter < 0 ? "♭".repeat(-alter) : "";

const decode = (s: string) =>
	s
		.replaceAll("&amp;", "&")
		.replaceAll("&lt;", "<")
		.replaceAll("&gt;", ">")
		.replaceAll("&quot;", '"')
		.replaceAll("&apos;", "'")
		.replaceAll("&#x266d;", "♭")
		.replaceAll("&#9837;", "♭")
		.replaceAll("&#x266f;", "♯")
		.replaceAll("&#9839;", "♯");
