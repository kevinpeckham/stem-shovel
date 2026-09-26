import type { DrumKitId } from "$lib/constants/drumMachine";
import { AcousticKit } from "./acoustic";
import { ElectronicKit } from "./electronic";
import type { DrumKit } from "./types";

const kits = new Map<DrumKitId, DrumKit>();

/** The kit by id, made once per page (the acoustic one starts fetching its files). */
export function drumKit(id: DrumKitId): DrumKit {
	let kit = kits.get(id);
	if (!kit) {
		kit = id === "acoustic" ? new AcousticKit() : new ElectronicKit();
		kits.set(id, kit);
	}
	return kit;
}
