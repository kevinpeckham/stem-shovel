import type { StemManifest } from "$lib/audio/types";
import type { PageLoad } from "./$types";

/**
 * PoC data source: a JSON manifest in static/. Step 4 of the plan swaps this
 * for a Turso query returning the same shape.
 */
export const load: PageLoad = async ({ fetch }) => {
	const res = await fetch("/stems/manifest.json");
	if (!res.ok) throw new Error(`Could not read /stems/manifest.json (${res.status})`);
	const manifest = (await res.json()) as StemManifest;
	return { manifest };
};
