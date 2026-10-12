import { STEM_MEMORY_SOFT_BYTES } from "#lib/constants/stemFormats.js";

/**
 * How much decoded audio a device can be expected to hold: a quarter of
 * what `navigator.deviceMemory` reports (Chrome and Edge, in whole
 * gigabytes, capped at 8), else the soft gigabyte. Above it the player says
 * the song may not load on this device (docs/audio-engine.md, "Memory is
 * the binding limit").
 */
export function stemMemoryBudget(deviceMemoryGb?: number | null): number {
	if (deviceMemoryGb && deviceMemoryGb > 0) return Math.round(deviceMemoryGb * 1024 ** 3 * 0.25);
	return STEM_MEMORY_SOFT_BYTES;
}
