import type { DrumKitId } from "$lib/constants/drumMachine";
import { SampledKit } from "./sampled";
import { ElectronicKit } from "./electronic";
import type { DrumKit } from "./types";

const kits = new Map<DrumKitId, DrumKit>();

/** The kit by id, made once per page. */
export function drumKit(id: DrumKitId): DrumKit {
	let kit = kits.get(id);
	if (!kit) {
		kit = id === "electronic" ? new ElectronicKit() : new SampledKit(id);
		kits.set(id, kit);
	}
	return kit;
}
