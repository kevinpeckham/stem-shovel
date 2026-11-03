import { barmarkChartPlays } from "./barmarkChartPlays.js";
import { chartReadToBarmark } from "./chartReadToBarmark.js";

type Execute = (statement: {
	sql: string;
	args: (string | number | null)[];
}) => Promise<{ rows: Record<string, unknown>[]; rowsAffected?: number }>;

interface Convert {
	execute: Execute;
	apply: boolean;
	log: (line: string) => void;
}

/** A read that is not a barmark chart yet: barmark plays no bar of it, or it has `m<n>` measure lines. */
const needsConversion = (text: string) => !barmarkChartPlays(text) || /^m\d+/m.test(text);

interface Row {
	id: string;
	songId: string;
	text: string;
	edited: boolean;
}

async function readsToConvert(execute: Execute): Promise<Row[]> {
	const { rows } = await execute({
		sql: "select id, song_id, chart_read, chart_read_edited from song_pdf where chart_read is not null order by id",
		args: [],
	});
	return rows
		.map((r) => ({
			id: String(r.id),
			songId: String(r.song_id),
			text: String(r.chart_read),
			edited: Number(r.chart_read_edited) === 1,
		}))
		.filter((r) => needsConversion(r.text));
}

/**
 * Every score file's chart read still in the old `m<n>` measure summary,
 * converted to barmark (`chartReadToBarmark`; scripts/convert-chart-reads.ts):
 * each row logged with its song, whether a member edited it, and accepted
 * or refused with why. With `apply` the accepted text is written over the
 * old (only while the row still holds the text read, so an edit in the app
 * meanwhile is never lost), `chart_read_edited` left as it was; a refused
 * row is never touched. `pending` counts the rows left in the old form.
 */
export async function convertChartReads({ execute, apply, log }: Convert): Promise<{
	found: number;
	converted: number;
	refused: number;
	pending: number;
}> {
	const rows = await readsToConvert(execute);
	let converted = 0;
	let refused = 0;
	for (const row of rows) {
		const result = chartReadToBarmark(row.text);
		const label = `${row.id} (song ${row.songId}${row.edited ? ", edited" : ""})`;
		if (!result.ok) {
			refused++;
			log(`${label}: refused, ${result.reason}`);
			continue;
		}
		const how = result.directionsAsWords ? ", directions kept as words" : "";
		if (!apply) {
			log(`${label}: accepted${how} (dry run)`);
			continue;
		}
		const written = await execute({
			sql: "update song_pdf set chart_read = ? where id = ? and chart_read = ?",
			args: [result.text, row.id, row.text],
		});
		if (written.rowsAffected === 0) log(`${label}: changed meanwhile, left as it is`);
		else {
			converted++;
			log(`${label}: converted${how}`);
		}
	}
	const pending = rows.length - converted;
	log(
		`${rows.length} reads in the old form: ${converted} converted, ${refused} refused, ${pending} left`,
	);
	return { found: rows.length, converted, refused, pending };
}
