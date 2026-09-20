import type { ArtistKind } from "$lib/val/ArtistKindSchema";

export const ARTIST_KIND_LABELS: Record<
	ArtistKind,
	{ label: string; short: string; hint: string }
> = {
	person: {
		label: "Solo artist",
		short: "solo",
		hint: "One person: their email goes on the record itself.",
	},
	group: {
		label: "Band or group",
		short: "band",
		hint: "A band, duo or collective: list the people under it.",
	},
};
