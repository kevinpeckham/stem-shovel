/** What a song's viewing link is aimed at, for its badge in the share popover: a mix (docs/mixes.md), a demo recording, or nothing. */
export function shareLinkAim(link: {
	mixId?: string | null;
	demoId?: string | null;
}): "mix" | "demo" | null {
	if (link.mixId) return "mix";
	if (link.demoId) return "demo";
	return null;
}
