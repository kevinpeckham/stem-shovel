import { sectionAbbreviation } from "./sectionAbbreviation";

/**
 * The timeline's short label for each section, in order: its abbreviation
 * (sectionAbbreviation), numbered by occurrence when the same name recurs
 * ("Verse", "Verse" → "V1", "V2"). A name that occurs once, or one that
 * carries its own number ("Verse 2" → "V2"), is not numbered.
 */
export function sectionLabels(sections: { name: string }[]): string[] {
	const keys = sections.map((s) => s.name.trim().toLowerCase());
	const counts = new Map<string, number>();
	for (const k of keys) counts.set(k, (counts.get(k) ?? 0) + 1);
	const seen = new Map<string, number>();
	return sections.map((s, i) => {
		const label = sectionAbbreviation(s.name);
		const key = keys[i];
		const nth = (seen.get(key) ?? 0) + 1;
		seen.set(key, nth);
		if ((counts.get(key) ?? 0) < 2 || /\d$/.test(label) || !label) return label;
		return `${label}${nth}`;
	});
}
