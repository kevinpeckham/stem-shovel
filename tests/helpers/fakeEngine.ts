import type { StemEngine } from "$lib/audio/engine.svelte";
import { vi } from "vite-plus/test";

/**
 * A StemEngine stand-in for component tests: the reactive fields the
 * components read, and spies for what they call. No AudioContext.
 */
export function fakeEngine(overrides: Partial<StemEngine> = {}): StemEngine {
	return {
		status: "ready",
		playing: false,
		position: 0,
		duration: 256.7,
		master: 1,
		stems: [],
		loaded: 0,
		total: 0,
		error: null,
		anySolo: false,
		toggle: vi.fn(),
		play: vi.fn(),
		pause: vi.fn(),
		seek: vi.fn(),
		setMaster: vi.fn(),
		mix: vi.fn(() => ({ master: 1, stems: [] })),
		...overrides,
	} as unknown as StemEngine;
}
