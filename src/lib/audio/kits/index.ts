import { isOverridableKit, type DrumKitManifest } from "#lib/constants/drumKits.js";
import { SampledKit } from "./sampled";
import { ElectronicKit } from "./electronic";
import type { DrumKit } from "./types";

const kits = new Map<string, DrumKit>();
const manifests = new Map<string, DrumKitManifest>();

/**
 * The custom kits a page may play (docs/drum-machine.md, "Custom kits"), as
 * the page hands them over; a kit whose files changed (a replaced sample
 * has a new URL) is made afresh so the next load fetches the new file.
 */
export function registerDrumKits(list: DrumKitManifest[]) {
	for (const m of list) {
		const before = manifests.get(m.id);
		manifests.set(m.id, m);
		// A kit made before its manifest arrived (the engine warmed a built-in as the page loaded), or one whose files changed, is made afresh.
		const changed = before
			? JSON.stringify(before.samples) !== JSON.stringify(m.samples)
			: Object.keys(m.samples).length > 0;
		if (changed) kits.delete(m.id);
	}
}
/** Whether the id names a kit this page can play: a built-in, or a registered custom kit. */
export function hasDrumKit(id: string): boolean {
	return id === "electronic" || id === "acoustic" || id === "room" || manifests.has(id);
}

/** The kit by id, made once per page; an unknown id plays as the acoustic kit. */
export function drumKit(id: string): DrumKit {
	let kit = kits.get(id);
	if (!kit) {
		const manifest = manifests.get(id);
		kit =
			id === "electronic"
				? new ElectronicKit()
				: isOverridableKit(id)
					? new SampledKit(id, manifest?.samples ?? null, true)
					: manifest
						? new SampledKit(id, manifest.samples)
						: new SampledKit("acoustic", null, true);
		kits.set(id, kit);
	}
	return kit;
}
