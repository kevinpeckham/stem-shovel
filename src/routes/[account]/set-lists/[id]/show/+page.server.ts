import { setListPage, setListSongDocs } from "#lib/server/data.js";
import { renderChartHtml } from "#lib/server/chartHtml.js";
import { renderMarkdown } from "#lib/server/markdown.js";
import { canViewSetList, canViewSong } from "#lib/server/viewAccess.js";
import type { ChartColumns } from "#lib/val/ChartColumnsSchema.js";
import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

type SongDocs = {
	id: string;
	chartMarkdown: string;
	chartColumns: ChartColumns | null;
	lyricsMarkdown: string;
};

/** A document rendered, null when it is empty. */
const rendered = (markdown: string, render: (markdown: string) => string) =>
	markdown ? render(markdown) || null : null;

/** A row's chart and lyrics, empty unless the viewer may read the song. */
function rowDocs(doc: SongDocs | undefined) {
	if (!doc) return { songId: null, chartMarkdown: null, chartHtml: null, lyricsHtml: null };
	return {
		/** The song, for the Key menu's per-song choice. */
		songId: doc.id,
		/** The chart text the show view's spelling and Key menus redraw from. */
		chartMarkdown: doc.chartMarkdown || null,
		// Drawn with the song's own column sizing, as on its page.
		chartHtml: rendered(doc.chartMarkdown, (md) =>
			renderChartHtml(md, { columns: doc.chartColumns ?? "shared" }),
		),
		lyricsHtml: rendered(doc.lyricsMarkdown, renderMarkdown),
	};
}

/**
 * A set list's show view (docs/band-plan.md, "Set list"): a member's, or a
 * visitor's holding its viewing link (the layout turns `?share=` into a
 * grant); anyone else gets a 404. A song row opens its chart and lyrics
 * for someone who may open the song, or who holds the set list's link (the
 * band handed them the night's set); otherwise it is its title alone.
 */
export const load: PageServerLoad = async ({ parent, params }) => {
	const { account, who, shareGrants } = await parent();
	const found = await setListPage(account.id, params.id);
	if (!found || !canViewSetList(found.setList, who, shareGrants)) error(404, "Not found");
	const linked = shareGrants.some((g) => g.setListId === found.setList.id);
	const readable = found.items.flatMap((r) =>
		r.song && (linked || canViewSong(r.song, who, shareGrants)) ? [r.song.id] : [],
	);
	const docs = new Map(
		(await setListSongDocs(account.id, readable)).map((d) => [d.id, d] as const),
	);
	return {
		setList: { id: found.setList.id, title: found.setList.title },
		rows: found.items.map((r) => ({
			id: r.id,
			title: r.title,
			note: r.note,
			...rowDocs(r.song ? docs.get(r.song.id) : undefined),
		})),
		/** A member: the way back to the editor. */
		member: who.accountRole !== null,
	};
};
