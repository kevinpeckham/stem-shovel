/**
 * Converts the score files' chart reads stored in the old `m<n>` measure
 * summary to barmark, the form `readChartWithAi` writes now (the app reads
 * a stored read with `barmarkChartBars`, so an unconverted one aligns no
 * bars). Each row is converted by `chartReadToBarmark`, which refuses
 * rather than guesses: a row is accepted only when barmark reads the new
 * text with no errors and plays the same bars as the old reader
 * (`chartBars`) played from the old. A refused row is reported with why
 * and left untouched, for a member to fix in the app or read again.
 *
 *   bunx varlock run -- bun scripts/convert-chart-reads.ts            # report only
 *   bunx varlock run -- bun scripts/convert-chart-reads.ts --apply
 *
 * With --apply the accepted text replaces the old, `chart_read_edited`
 * kept as it was. Exits 0 when nothing is left in the old form (none
 * found, or every one converted), 2 when rows are left (refused, or a dry
 * run), 1 on an error. No import of src/lib/server (it pulls in $app/*).
 */
import { createClient } from "@libsql/client";
import { convertChartReads } from "../src/lib/utils/convertChartReads";
import { libsqlUrl } from "../src/lib/utils/libsqlUrl";

const apply = process.argv.includes("--apply");
const db = createClient({
	url: libsqlUrl(process.env.TURSO_DATABASE_URL!),
	authToken: process.env.TURSO_AUTH_TOKEN!,
});

try {
	const { pending } = await convertChartReads({
		execute: (statement) => db.execute(statement),
		apply,
		log: (line) => console.log(line),
	});
	process.exitCode = pending > 0 ? 2 : 0;
} catch (error) {
	console.error(error);
	process.exitCode = 1;
}
