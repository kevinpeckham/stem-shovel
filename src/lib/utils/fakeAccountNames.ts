/**
 * Made-up account names for the /support line-up, so the real one hides
 * among four that look like bands and studios. `random` is 0..1 (injectable
 * for tests); names never repeat within a call and never equal `exclude`.
 */
const FIRST = [
	"Silver",
	"Hollow",
	"Velvet",
	"Copper",
	"Wandering",
	"Quiet",
	"Midnight",
	"Paper",
	"Iron",
	"Golden",
	"Broken",
	"Lucky",
	"Northern",
	"Electric",
	"Sleepy",
	"Wild",
	"Little",
	"Crooked",
	"Harbor",
	"Cedar",
];
const SECOND = [
	"Pines",
	"Mountain",
	"Records",
	"Foxes",
	"Rodeo",
	"Kitchen",
	"Choir",
	"Orchard",
	"Lanterns",
	"Harbor",
	"Collective",
	"Bandits",
	"Studio",
	"Sisters",
	"Brothers",
	"Union",
	"Radio",
	"Garden",
	"Parade",
	"Hollow",
];

export function fakeAccountNames(count: number, exclude: string, random = Math.random): string[] {
	const out: string[] = [];
	const taken = new Set([exclude.toLowerCase()]);
	let guard = 0;
	while (out.length < count && guard++ < 200) {
		const name = `${FIRST[Math.floor(random() * FIRST.length)]} ${SECOND[Math.floor(random() * SECOND.length)]}`;
		if (taken.has(name.toLowerCase())) continue;
		taken.add(name.toLowerCase());
		out.push(name);
	}
	return out;
}
