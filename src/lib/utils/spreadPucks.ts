/** A puck's place in its cluster: the pixel offset that spreads it from the shared point, and its index and the cluster's size (1 when alone). */
export interface PuckSpread {
	dx: number;
	dy: number;
	index: number;
	count: number;
}

/**
 * Pucks that share a spot on the Stage (docs/multitrack-recorder.md "The
 * Stage: group pucks and clusters") spread into a ring around it, six to a
 * ring and wider rings beyond, so every one can be grabbed; a puck alone
 * stays put. Points are pixels; `near` is how close two must sit to
 * cluster, `ring` the first ring's radius (30 px: six 40 px pucks in a
 * ring overlap a little and still each show). The order of `points` decides
 * who sits where, and the first of a cluster keeps the label.
 */
export function spreadPucks(
	points: readonly { id: string; x: number; y: number }[],
	near = 8,
	ring = 30,
): Map<string, PuckSpread> {
	const clusters: { x: number; y: number; ids: string[] }[] = [];
	for (const p of points) {
		const c = clusters.find((k) => Math.hypot(k.x - p.x, k.y - p.y) <= near);
		if (c) c.ids.push(p.id);
		else clusters.push({ x: p.x, y: p.y, ids: [p.id] });
	}
	const out = new Map<string, PuckSpread>();
	for (const c of clusters) {
		const n = c.ids.length;
		c.ids.forEach((id, index) => {
			if (n === 1) {
				out.set(id, { dx: 0, dy: 0, index: 0, count: 1 });
				return;
			}
			const band = Math.floor(index / 6);
			const inBand = Math.min(6, n - band * 6);
			const angle = -Math.PI / 2 + ((index - band * 6) / inBand) * 2 * Math.PI;
			const r = ring * (band + 1);
			out.set(id, {
				dx: Math.round(Math.cos(angle) * r * 100) / 100,
				dy: Math.round(Math.sin(angle) * r * 100) / 100,
				index,
				count: n,
			});
		});
	}
	return out;
}
