import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { sweepOrphans } from "./sweepOrphans";

// Row selection runs on real SQLite through a `file:` URL, never a statement
// mock. Foreign keys are switched off so orphans can exist, as on Turso's
// engine kind.
describe("sweepOrphans", () => {
	let dir: string;
	let client: Client;
	let lines: string[];
	beforeEach(async () => {
		dir = mkdtempSync(join(tmpdir(), "sweep-"));
		client = createClient({ url: `file:${join(dir, "db.sqlite")}` });
		lines = [];
		await client.executeMultiple(`
			PRAGMA foreign_keys = OFF;
			create table song (id text primary key);
			create table stem (id text primary key, song_id text);
			create table take (id text primary key, stem_id text);
			create table pin (id text primary key, song_id text);
			create table vote (id text primary key, song_id text);
			insert into song values ('s1');
			insert into stem values ('a', 's1'), ('b', 'gone');
			insert into take values ('t1', 'a'), ('t2', 'b');
			insert into pin values ('p1', 'gone'), ('p2', 's1');
			insert into vote values ('v1', 'gone');
		`);
	});
	afterEach(() => {
		client.close();
		rmSync(dir, { recursive: true, force: true });
	});

	const fks = [
		// The child before its parent, so a cascade reaches it on the second pass.
		{ table: "take", column: "stem_id", parent: "stem", parentColumn: "id", onDelete: "cascade" },
		{ table: "stem", column: "song_id", parent: "song", parentColumn: "id", onDelete: "cascade" },
		{ table: "pin", column: "song_id", parent: "song", parentColumn: "id", onDelete: "set null" },
		{ table: "vote", column: "song_id", parent: "song", parentColumn: "id", onDelete: "no action" },
	];
	const run = (apply: boolean) =>
		sweepOrphans({
			execute: (sql) => client.execute(sql),
			fks,
			apply,
			log: (line) => lines.push(line),
		});
	const ids = async (table: string, column = "id") =>
		(await client.execute(`select ${column} as v from ${table} order by id`)).rows.map((r) => r.v);

	it("reports without touching a row on a dry run", async () => {
		expect(await run(false)).toEqual({ total: 2, refusedRows: 1, pending: true });
		expect(lines).toEqual([
			"stem.song_id → song: 1 orphaned (delete, dry run)",
			"pin.song_id → song: 1 orphaned (clear, dry run)",
			"vote.song_id → song: 1 orphaned (refuses, dry run)",
			"2 rows would be swept; rerun with --apply",
			"1 orphaned rows under keys without cascade or set null; left in place",
		]);
		expect(await ids("stem")).toEqual(["a", "b"]);
	});

	it("deletes, clears and refuses, following a delete to the next level", async () => {
		expect(await run(true)).toEqual({ total: 3, refusedRows: 1, pending: true });
		expect(lines).toEqual([
			"stem.song_id → song: 1 orphaned (delete)",
			"pin.song_id → song: 1 orphaned (clear)",
			"vote.song_id → song: 1 orphaned (refuses, dry run)",
			"pass 2: take.stem_id → stem: 1 orphaned (delete)",
			"3 rows swept",
			"1 orphaned rows under keys without cascade or set null; left in place",
		]);
		expect(await ids("stem")).toEqual(["a"]);
		expect(await ids("take")).toEqual(["t1"]);
		expect(await ids("pin", "song_id")).toEqual([null, "s1"]);
		expect(await ids("vote")).toEqual(["v1"]);
	});

	it("says so when nothing is orphaned", async () => {
		await client.executeMultiple(
			"delete from stem where id = 'b'; delete from take where id = 't2'; delete from pin; delete from vote;",
		);
		expect(await run(true)).toEqual({ total: 0, refusedRows: 0, pending: false });
		expect(lines).toEqual(["no orphans across 4 foreign keys"]);
	});
});
