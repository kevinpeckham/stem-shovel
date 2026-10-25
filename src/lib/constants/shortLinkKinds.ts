import type { ShortLinkKind } from "#lib/val/ShortLinkSchema.js";

/** What a short link points at, as the links page names it (/settings/links). */
export const SHORT_LINK_KIND_LABELS: Record<ShortLinkKind, string> = {
	"chord-player": "Chord Player",
	"drum-machine": "Drum Machine",
	piano: "Piano",
	"practice-amp": "Practice Amp",
	song: "Song",
	project: "Project",
	studio: "Studio song",
	other: "Page",
};
