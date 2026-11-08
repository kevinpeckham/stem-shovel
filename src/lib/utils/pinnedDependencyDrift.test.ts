import { describe, expect, it } from "vite-plus/test";
import { pinnedDependencyDrift } from "./pinnedDependencyDrift";

describe("pinnedDependencyDrift", () => {
	it("is empty when every exact pin is installed", () => {
		const installed: Record<string, string> = { "@barmark/musicxml": "0.7.1", barmark: "0.21.0" };
		expect(
			pinnedDependencyDrift(
				{ "@barmark/musicxml": "0.7.1", barmark: "0.21.0" },
				(n) => installed[n] ?? null,
			),
		).toEqual([]);
	});

	it("names a stale package with its pinned and installed versions", () => {
		expect(pinnedDependencyDrift({ "@barmark/musicxml": "0.6.0" }, () => "0.4.0")).toEqual([
			{ name: "@barmark/musicxml", pinned: "0.6.0", installed: "0.4.0" },
		]);
	});

	it("reports a missing package as installed null", () => {
		expect(pinnedDependencyDrift({ "@barmark/midi": "0.2.0" }, () => null)).toEqual([
			{ name: "@barmark/midi", pinned: "0.2.0", installed: null },
		]);
	});

	it("skips ranges and non-semver specifiers", () => {
		expect(
			pinnedDependencyDrift(
				{ a: "^1.7.14", b: "~2.0.0", c: "workspace:*", d: "latest" },
				() => "0.0.0",
			),
		).toEqual([]);
	});

	it("checks prerelease pins exactly", () => {
		expect(pinnedDependencyDrift({ x: "1.0.0-beta.2" }, () => "1.0.0-beta.1")).toEqual([
			{ name: "x", pinned: "1.0.0-beta.2", installed: "1.0.0-beta.1" },
		]);
	});
});
