import { expect, it, vi } from "vite-plus/test";
import { asSignedOut } from "../../../../tests/helpers/fakeRequestEvent";
import { callRoute } from "../../../../tests/helpers/fakeApiEvent";

const run = vi.hoisted(() => vi.fn());
vi.mock("#lib/server/db/index.js", () => ({ db: { run } }));

const { GET } = await import("./+server");

it("GET /api/warm: one round trip to the database, then an uncached ok", async () => {
	const res = await callRoute(GET, asSignedOut(), new Request("http://localhost/api/warm"));
	expect(run).toHaveBeenCalledTimes(1);
	expect(res.headers.get("cache-control")).toBe("no-store");
	expect(await res.json()).toEqual({ ok: true });
});
