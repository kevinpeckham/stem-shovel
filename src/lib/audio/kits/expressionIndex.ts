import type { DrumKitManifest } from "#lib/constants/drumKits.js";
import { SampledKit } from "./expressionSampled";

let kit: SampledKit | null = null;

export function registerDrumKits(_list: DrumKitManifest[]) {}

export function hasDrumKit(id: string): boolean {
	return id === "future";
}

export function drumKit(id: string): SampledKit {
	kit ??= new SampledKit("future");
	return kit;
}
