import { describe, expect, it } from "vite-plus/test";
import { hmrFailedModule, isViteHmrFailure } from "./isViteHmrFailure";

const frames = (...filenames: string[]) => ({
	frames: filenames.map((filename) => ({ filename })),
});
const message = "Cannot read properties of undefined (reading 'default')";
/** STEM-SHOVEL-1A: Sentry lists frames oldest first, Vite's client then the component's accept handler. */
const hmrFailure = {
	exception: {
		values: [
			{
				type: "TypeError",
				value: message,
				stacktrace: frames("/@vite/client", "/@vite/client", "/src/routes/dashboard/+page.svelte"),
			},
		],
	},
};
const withException = (exception: object) => ({ exception: { values: [exception] } });

describe("isViteHmrFailure", () => {
	it("knows a hot update Vite could not apply", () => {
		expect(isViteHmrFailure(hmrFailure)).toBe(true);
	});
	it("knows Firefox's and Safari's words", () => {
		for (const value of [
			"mod.default is undefined",
			"undefined is not an object (evaluating 'mod.default')",
		]) {
			expect(isViteHmrFailure(withException({ ...hmrFailure.exception.values[0], value }))).toBe(
				true,
			);
		}
	});
	it("leaves the same message from the app's own code alone", () => {
		const ownCode = {
			type: "TypeError",
			value: message,
			stacktrace: frames("/src/routes/dashboard/+page.svelte"),
		};
		expect(isViteHmrFailure(withException(ownCode))).toBe(false);
	});
	it("leaves other errors from Vite's client alone", () => {
		const other = {
			type: "TypeError",
			value: "Failed to fetch",
			stacktrace: frames("/@vite/client"),
		};
		expect(isViteHmrFailure(withException(other))).toBe(false);
		expect(isViteHmrFailure({})).toBe(false);
	});
});

describe("hmrFailedModule", () => {
	it("names the module whose update failed", () => {
		expect(hmrFailedModule(hmrFailure)).toBe("/src/routes/dashboard/+page.svelte");
	});
	it("is undefined when the stack names none", () => {
		expect(hmrFailedModule({})).toBeUndefined();
	});
});
