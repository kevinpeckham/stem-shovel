import { expect, it, vi } from "vite-plus/test";
import { asSignedOut } from "../../../../../tests/helpers/fakeRequestEvent";
import { callRoute } from "../../../../../tests/helpers/fakeApiEvent";

const run = vi.hoisted(() => vi.fn());
// `schema` for the Idea Recorder's load module, imported below to compare configs (its data layer takes `db` and `schema` at import).
vi.mock("#lib/server/db/index.js", () => ({ db: { run }, schema: {} }));

const { GET, config } = await import("./+server");

it("GET /api/warm/long: one round trip to the database, then an uncached ok", async () => {
	const res = await callRoute(GET, asSignedOut(), new Request("http://localhost/api/warm/long"));
	expect(run).toHaveBeenCalledTimes(1);
	expect(res.headers.get("cache-control")).toBe("no-store");
	expect(await res.json()).toEqual({ ok: true });
});

it("declares the Idea Recorder's config, so the adapter bundles it into that function", async () => {
	const recorder = await import("../../../idea-recorder/+page.server");
	expect(config).toEqual(recorder.config);
});
