/** A package whose installed version is not the exact version package.json pins. */
export type PinDrift = { name: string; pinned: string; installed: string | null };

/** An exact pin: `1.2.3` or `1.2.3-beta.1`, no range operator. */
const EXACT_PIN = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

/**
 * Exact-pinned dependencies whose installed version differs from the pin; `installed` is
 * null when the package is missing. A pull that bumps a pin without `bun install` leaves the
 * old package in node_modules, and Vite then fails on an export only the new one has
 * (STEM-SHOVEL-7K: @barmark/musicxml 0.4.0 installed, `readMxl` needing 0.5.0+). Ranges
 * (`^1.2.0`) are skipped: any version they admit is fine.
 */
export function pinnedDependencyDrift(
	pins: Record<string, string>,
	installedVersionOf: (name: string) => string | null,
): PinDrift[] {
	const drift: PinDrift[] = [];
	for (const [name, pinned] of Object.entries(pins)) {
		if (!EXACT_PIN.test(pinned)) continue;
		const installed = installedVersionOf(name);
		if (installed !== pinned) drift.push({ name, pinned, installed });
	}
	return drift;
}
