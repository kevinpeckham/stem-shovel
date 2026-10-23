import type { StudioArrangement, StudioBus, StudioTrack } from "#lib/val/StudioSchema.js";

/** A row of the timeline: a group's header (a folder bus) at its depth, or a track at its depth under its groups. */
export type StudioRow =
	| { kind: "group"; bus: StudioBus; depth: number; collapsed: boolean }
	| { kind: "track"; track: StudioTrack; depth: number };

/**
 * The timeline's rows (docs/multitrack-recorder.md "Folder tracks"): the
 * tracks in their order, each group (a `folder` bus) opening where its
 * first track sits and holding what routes to it, groups inside groups
 * by their `output`. A collapsed group keeps its row and hides what is
 * under it. A group with no tracks under it comes last, so a new one has
 * somewhere to appear. A group whose outputs run in a circle is cut at
 * the first repeat, so every row appears once.
 */
export function studioRows(
	a: Pick<StudioArrangement, "tracks" | "buses">,
	collapsed: Record<string, boolean> = {},
): StudioRow[] {
	const buses = a.buses ?? [];
	const folders = new Map(buses.filter((b) => b.folder).map((b) => [b.id, b]));
	/** The group a strip is in: its output when that is a folder. */
	const groupOf = (output: string | undefined) =>
		output && folders.has(output) ? output : undefined;
	/** A group's chain of groups, outermost first, stopping at a repeat. */
	const chainOf = (groupId: string): string[] => {
		const chain: string[] = [];
		let at: string | undefined = groupId;
		while (at && folders.has(at) && !chain.includes(at)) {
			chain.unshift(at);
			at = groupOf(folders.get(at)!.output);
		}
		return chain;
	};
	const out: StudioRow[] = [];
	const opened = new Set<string>();
	/** The groups open around the row being added, outermost first. */
	let open: string[] = [];
	const openTo = (chain: string[]) => {
		// Close what the chain leaves, open what it adds (a group row once).
		let common = 0;
		while (common < open.length && common < chain.length && open[common] === chain[common])
			common++;
		open = open.slice(0, common);
		for (const id of chain.slice(common)) {
			if (!opened.has(id)) {
				opened.add(id);
				// A group inside a collapsed one is hidden with the rest.
				if (!open.some((g) => collapsed[g]))
					out.push({
						kind: "group",
						bus: folders.get(id)!,
						depth: open.length,
						collapsed: !!collapsed[id],
					});
			}
			open = [...open, id];
		}
	};
	const hidden = (chain: string[]) => chain.some((id) => collapsed[id]);
	for (const t of a.tracks) {
		const group = groupOf(t.output);
		const chain = group ? chainOf(group) : [];
		openTo(chain);
		if (!hidden(chain)) out.push({ kind: "track", track: t, depth: chain.length });
	}
	for (const b of buses) {
		if (!b.folder || opened.has(b.id)) continue;
		openTo(chainOf(b.id));
	}
	return out;
}
