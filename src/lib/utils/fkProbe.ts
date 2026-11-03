import type { Client } from "@libsql/client";

interface FkProbeResult {
	date: string;
	defaultPragma: number;
	pragmaSticksAcrossClients: boolean;
	cascadeFired: boolean;
	violationRejected: boolean;
}

const pragmaOf = async (client: Client) =>
	Number(Object.values((await client.execute("PRAGMA foreign_keys")).rows[0] ?? {})[0]);

async function rejects(run: () => Promise<unknown>): Promise<boolean> {
	try {
		await run();
		return false;
	} catch {
		return true;
	}
}

/**
 * The five-key foreign-key probe (docs/fk-coordinated-response-2026-11-03.md):
 * what the platform does today, as a change detector. Each reading opens a
 * fresh client from `open`, so a setting one connection made cannot leak into
 * the next reading. The cascade and violation checks run on scratch tables
 * with a unique suffix, dropped afterward whatever happens.
 */
export async function fkProbe(open: () => Client): Promise<FkProbeResult> {
	const clients: Client[] = [];
	const fresh = () => {
		const client = open();
		clients.push(client);
		return client;
	};
	try {
		const defaultPragma = await pragmaOf(fresh());
		await fresh().execute("PRAGMA foreign_keys = ON");
		const pragmaSticksAcrossClients = (await pragmaOf(fresh())) === 1;

		const stamp = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
		const parent = `__fk_probe_${stamp}_parent`;
		const child = `__fk_probe_${stamp}_child`;
		const db = fresh();
		try {
			await db.execute(`create table "${parent}" (id text primary key)`);
			await db.execute(
				`create table "${child}" (id text primary key, parent_id text references "${parent}"(id) on delete cascade)`,
			);
			await db.execute(`insert into "${parent}" (id) values ('p')`);
			await db.execute(`insert into "${child}" (id, parent_id) values ('c', 'p')`);
			await db.execute(`delete from "${parent}" where id = 'p'`);
			const left = await db.execute(`select count(*) as n from "${child}" where id = 'c'`);
			const cascadeFired = Number(left.rows[0].n) === 0;
			const violationRejected = await rejects(() =>
				db.execute(`insert into "${child}" (id, parent_id) values ('orphan', 'missing')`),
			);
			return {
				date: new Date().toISOString().slice(0, 10),
				defaultPragma,
				pragmaSticksAcrossClients,
				cascadeFired,
				violationRejected,
			};
		} finally {
			await db.execute(`drop table if exists "${child}"`);
			await db.execute(`drop table if exists "${parent}"`);
		}
	} finally {
		for (const client of clients) client.close();
	}
}
