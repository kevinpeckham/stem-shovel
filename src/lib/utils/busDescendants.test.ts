import { describe, expect, it } from "vite-plus/test";
import { busDescendants } from "./busDescendants";
import type { StudioBus } from "#lib/val/StudioSchema.js";

const bus = (id: string, output?: string): StudioBus => ({
	id,
	name: id,
	gain: 1,
	pan: 0,
	muted: false,
	...(output ? { output } : {}),
});

describe("busDescendants", () => {
	it("gathers the bus and what routes into it, through any depth", () => {
		const buses = [bus("drums"), bus("kit", "drums"), bus("toms", "kit"), bus("fx")];
		expect([...busDescendants(buses, "drums")].sort()).toEqual(["drums", "kit", "toms"]);
		expect([...busDescendants(buses, "kit")].sort()).toEqual(["kit", "toms"]);
		expect([...busDescendants(buses, "fx")]).toEqual(["fx"]);
	});
	it("ends on a circle", () => {
		const buses = [bus("a", "b"), bus("b", "a")];
		expect([...busDescendants(buses, "a")].sort()).toEqual(["a", "b"]);
	});
});
