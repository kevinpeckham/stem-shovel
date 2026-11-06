import { error, redirect } from "@sveltejs/kit";
import { RELEASES_PER_PAGE } from "#lib/constants/releasesPage.js";
import { renderMarkdown } from "#lib/server/markdown.js";
import { pageSlice } from "#lib/utils/pageSlice.js";
import { parseChangelog } from "#lib/utils/parseChangelog.js";
import releasesMarkdown from "../../../RELEASES.md?raw";
import type { PageServerLoad } from "./$types";

/** Every section, newest first; the file is bundled, so it is parsed once per instance. */
const all = parseChangelog(releasesMarkdown);

/** `/releases` for page 1 (one address per page), `/releases?page=N` after it. */
const pageHref = (page: number) => (page === 1 ? "/releases" : `/releases?page=${page}`);

/**
 * The releases page: RELEASES.md from the repository (the user-facing
 * notes a release writes beside CHANGELOG.md; bundled at build time, so a
 * deploy is the update), split into one section per version and shown
 * RELEASES_PER_PAGE at a time, newest first. Public. `?page=1` and a page
 * that is not a positive integer redirect to `/releases`; a page past the
 * last is a 404. `?v=x.y.z` redirects to the page that holds that version,
 * at its anchor, so a link to a version still lands once it has moved off
 * the first page. Until 2026-11-05 the page was the "releases" user doc,
 * pasted by hand on each stage after every release.
 */
export const load: PageServerLoad = async ({ url }) => {
	const v = url.searchParams.get("v");
	if (v !== null) {
		const index = all.findIndex((r) => r.version === v);
		if (index < 0) error(404, "No such release.");
		const page = Math.floor(index / RELEASES_PER_PAGE) + 1;
		redirect(302, `${pageHref(page)}#v${v}`);
	}

	const raw = url.searchParams.get("page");
	let requested = 1;
	if (raw !== null) {
		if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) === 1) redirect(302, "/releases");
		requested = Number(raw);
	}

	const { items, page, pages } = pageSlice(all, requested, RELEASES_PER_PAGE);
	if (requested > pages) error(404, "No such page of releases.");

	return {
		releases: items.map((r) => ({
			version: r.version,
			date: r.date,
			html: renderMarkdown(r.body),
		})),
		page,
		pages,
		total: all.length,
	};
};
