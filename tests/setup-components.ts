// Component-test setup (Vitest `components` project): jest-dom matchers
// (`toBeInTheDocument`, `toBeDisabled`, …) on Vitest's `expect`. Cleanup
// between tests comes from svelteTesting() in vite.config.ts.
import "@testing-library/jest-dom/vitest";

// jsdom has no ResizeObserver; Svelte's bind:clientWidth needs one. Sizes stay 0.
if (typeof globalThis.ResizeObserver === "undefined") {
	globalThis.ResizeObserver = class {
		observe() {}
		unobserve() {}
		disconnect() {}
	} as unknown as typeof ResizeObserver;
}
