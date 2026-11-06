import { describe, expect, it, vi } from "vite-plus/test";
import { RELEASES_PER_PAGE } from "#lib/constants/releasesPage.js";
import { parseChangelog } from "#lib/utils/parseChangelog.js";
import releasesMarkdown from "../../../RELEASES.md?raw";
import { load } from "./+page.server";

vi.mock("#lib/server/markdown.js", () => ({ renderMarkdown: (s: string) => s }));

interface Loaded {
	releases: { version: string; date: string | null; html: string }[];
	page: number;
	pages: number;
	total: number;
}

const all = parseChangelog(releasesMarkdown);
/** The loader reads only `url`. */
const run = (query: string) =>
	load({ url: new URL(`http://localhost/releases${query}`) } as unknown as Parameters<
		typeof load
	>[0]);
const loaded = async (query: string) => (await run(query)) as Loaded;
const redirectTo = (location: string) => ({ status: 302, location });

describe("/releases load", () => {
	it("shows the newest page of versions on /releases", async () => {
		const d = await loaded("");
		expect(d.page).toBe(1);
		expect(d.releases).toHaveLength(RELEASES_PER_PAGE);
		expect(d.releases[0].version).toBe(all[0].version);
		expect(d.total).toBe(all.length);
		expect(d.pages).toBe(Math.ceil(all.length / RELEASES_PER_PAGE));
	});

	it("continues on page 2 where page 1 ended", async () => {
		const first = await loaded("");
		const second = await loaded("?page=2");
		expect(second.page).toBe(2);
		const onFirst = new Set(first.releases.map((r) => r.version));
		expect(onFirst.has(second.releases[0].version)).toBe(false);
		expect(second.releases[0].version).toBe(all[RELEASES_PER_PAGE].version);
	});

	it("sends ?page=1 to /releases", async () => {
		await expect(run("?page=1")).rejects.toMatchObject(redirectTo("/releases"));
	});

	it("sends a page that is not a positive integer to /releases", async () => {
		await expect(run("?page=abc")).rejects.toMatchObject(redirectTo("/releases"));
		await expect(run("?page=0")).rejects.toMatchObject(redirectTo("/releases"));
		await expect(run("?page=2.5")).rejects.toMatchObject(redirectTo("/releases"));
	});

	it("answers a page past the last with a 404", async () => {
		await expect(run("?page=999")).rejects.toMatchObject({ status: 404 });
	});

	it("sends ?v= of the newest version to its anchor on /releases", async () => {
		const v = all[0].version;
		await expect(run(`?v=${v}`)).rejects.toMatchObject(redirectTo(`/releases#v${v}`));
	});

	it("sends ?v= of an old version to its page and anchor", async () => {
		const index = RELEASES_PER_PAGE + 3;
		const v = all[index].version;
		await expect(run(`?v=${v}`)).rejects.toMatchObject(redirectTo(`/releases?page=2#v${v}`));
	});

	it("answers an unknown ?v= with a 404", async () => {
		await expect(run("?v=99.99.99")).rejects.toMatchObject({ status: 404 });
	});
});
