import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client, type InStatement } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { fkProbe } from "./fkProbe";

// Real SQLite through a `file:` URL, not a statement mock. What this proves:
// the probe's shape, that each reading uses its own connection, that it reads
// both an enforcing and a non-enforcing database correctly, and that the
// scratch tables are gone afterward. What it cannot prove: what Turso does.
// The engine kind's answers are the point of running the probe there.
// (@libsql/client turns foreign keys on for every local connection, so local
// SQLite behaves like the classic, enforcing kind; the second case switches
// them off per connection to stand in for the engine kind.)
describe("fkProbe", () => {
	let dir: string;
	let url: string;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "fk-probe-"));
		url = `file:${join(dir, "db.sqlite")}`;
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	async function scratchTablesLeft() {
		const client = createClient({ url });
		const { rows } = await client.execute(
			"select name from sqlite_master where name like '__fk_probe%'",
		);
		client.close();
		return rows;
	}

	it("reads an enforcing database and leaves no scratch tables", async () => {
		expect(await fkProbe(() => createClient({ url }))).toEqual({
			date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			defaultPragma: 1,
			pragmaSticksAcrossClients: true,
			cascadeFired: true,
			violationRejected: true,
		});
		expect(await scratchTablesLeft()).toEqual([]);
	});

	it("reads a database whose connections start with foreign keys off", async () => {
		const openOff = (): Client => {
			const client = createClient({ url });
			let ready: Promise<unknown> | undefined;
			return {
				execute: async (statement: InStatement) => {
					ready ??= client.execute("PRAGMA foreign_keys = OFF");
					await ready;
					return client.execute(statement);
				},
				close: () => client.close(),
			} as Client;
		};
		expect(await fkProbe(openOff)).toEqual({
			date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
			defaultPragma: 0,
			pragmaSticksAcrossClients: false,
			cascadeFired: false,
			violationRejected: false,
		});
		expect(await scratchTablesLeft()).toEqual([]);
	});
});
