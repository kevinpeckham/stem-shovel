import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vite-plus/test";
import { liveForeignKeys } from "./liveForeignKeys";

// Real SQLite through a `file:` URL, not a statement mock: what is under test
// is how the pragma's rows are read.
describe("liveForeignKeys", () => {
	let dir: string;
	let client: Client;
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), "live-fks-"));
		client = createClient({ url: `file:${join(dir, "db.sqlite")}` });
	});
	afterEach(() => {
		client.close();
		rmSync(dir, { recursive: true, force: true });
	});
	const execute = (sql: string) =>
		client.execute(sql) as unknown as Promise<{ rows: Record<string, unknown>[] }>;

	it("reads each foreign key with its action, skipping internal tables", async () => {
		await client.executeMultiple(`
			create table parent (id text primary key);
			create table child (id text primary key, parent_id text references parent(id) on delete cascade);
			create table __drizzle_migrations (id integer primary key, parent_id text references parent(id));
		`);
		expect(await liveForeignKeys(execute)).toEqual([
			{
				table: "child",
				column: "parent_id",
				parent: "parent",
				parentColumn: "id",
				onDelete: "cascade",
			},
		]);
	});

	it("resolves a key without a column to the parent's primary key", async () => {
		await client.executeMultiple(`
			create table parent (code text primary key);
			create table child (id text primary key, parent_code text references parent);
		`);
		expect(await liveForeignKeys(execute)).toEqual([
			{
				table: "child",
				column: "parent_code",
				parent: "parent",
				parentColumn: "code",
				onDelete: "no action",
			},
		]);
	});
});
