import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { convertChartReads } from "./convertChartReads";

// The rows are chosen and written on real SQLite through a `file:` URL, never a statement mock.
describe("convertChartReads", () => {
	let dir: string;
	let client: Client;
	let lines: string[];
	const OLD = "m1 key F major 4/4 tempo 120: F\nm2: C";
	const NEW = "key: F, time: 4/4, tempo: 120\n| F | C |";
	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), "chart-reads-"));
		client = createClient({ url: `file:${join(dir, "db.sqlite")}` });
		lines = [];
		await client.execute(
			"create table song_pdf (id text primary key, song_id text, chart_read text, chart_read_edited integer not null default 0)",
		);
		await client.batch([
			{ sql: "insert into song_pdf values ('f1', 's1', ?, 0)", args: [OLD] },
			{ sql: "insert into song_pdf values ('f2', 's2', ?, 1)", args: [`${OLD}\nm3: Xq7`] },
			{ sql: "insert into song_pdf values ('f3', 's3', ?, 1)", args: [NEW] },
			{ sql: "insert into song_pdf values ('f4', 's4', null, 0)", args: [] },
		]);
	});
	afterEach(() => {
		client.close();
		rmSync(dir, { recursive: true, force: true });
	});
	const run = (apply: boolean) =>
		convertChartReads({
			execute: (statement) => client.execute(statement),
			apply,
			log: (line) => lines.push(line),
		});
	const rows = async () =>
		(
			await client.execute("select id, chart_read, chart_read_edited from song_pdf order by id")
		).rows.map((r) => [r.id, r.chart_read, Number(r.chart_read_edited)]);

	it("reports each old read, accepted or refused, without touching a row on a dry run", async () => {
		const before = await rows();
		expect(await run(false)).toEqual({ found: 2, converted: 0, refused: 1, pending: 2 });
		expect(lines).toEqual([
			"f1 (song s1): accepted (dry run)",
			"f2 (song s2, edited): refused, the barmark text has an error: Line 2: Xq7: a chord starts with a root A–G (Xq7)",
			"2 reads in the old form: 0 converted, 1 refused, 2 left",
		]);
		expect(await rows()).toEqual(before);
	});

	it("with apply writes the accepted read, keeps the edited flag, and leaves the refused and the barmark ones", async () => {
		expect(await run(true)).toEqual({ found: 2, converted: 1, refused: 1, pending: 1 });
		expect(await rows()).toEqual([
			["f1", NEW, 0],
			["f2", `${OLD}\nm3: Xq7`, 1],
			["f3", NEW, 1],
			["f4", null, 0],
		]);
		lines = [];
		expect(await run(true)).toMatchObject({ found: 1, converted: 0, pending: 1 });
	});

	it("nothing in the old form is nothing to do", async () => {
		await client.execute("delete from song_pdf where id in ('f1', 'f2')");
		expect(await run(true)).toEqual({ found: 0, converted: 0, refused: 0, pending: 0 });
		expect(lines).toEqual(["0 reads in the old form: 0 converted, 0 refused, 0 left"]);
	});
});
