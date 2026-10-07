import * as schema from "$lib/server/db/schema";
import {
	Column,
	Many,
	One,
	Param,
	SQL,
	StringChunk,
	Table,
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	getTableColumns,
	getTableName,
	is,
	normalizeRelation,
	type Relation,
} from "drizzle-orm";

/**
 * A stand-in for the `db` export of `src/lib/server/db` in server tests
 * (`vi.mock("$lib/server/db", () => ({ db: fake, schema }))`). Rows live in
 * memory per table, keyed by the schema's export name (`idea`,
 * `studioRevision`…), and every operation is logged in `calls` for the test
 * to assert on. It is a test double, not an ORM: it evaluates the `where`
 * clauses this codebase writes (`eq`, `ne`, `and`, `or`, `not`, `inArray`,
 * `notInArray`, `isNull`, `isNotNull`, `<`, `>`, `<=`, `>=`) against JS rows,
 * orders by `asc`/`desc`, projects `columns`, resolves `with` through the
 * schema's own relations, and knows `sql\`count(*)\`` in a select. Anything
 * else throws, naming the clause, and the test can give that table a
 * `findFirst`/`findMany` of its own instead.
 *
 * Inserted rows get the column defaults the schema declares in JS
 * (`$defaultFn` ids, literal defaults, timestamps as `new Date()`); an
 * update refreshes an `$onUpdate` column only when the row carries it, so a
 * fixture without `updatedAt` stays comparable with `toEqual`. Transactions
 * and joins are not supported.
 */

export type Row = Record<string, unknown>;

interface DbCall {
	op: "select" | "insert" | "update" | "delete" | "findFirst" | "findMany";
	/** The SQL table name (`getTableName`): `studio_revision`, not `studioRevision`. */
	table: string;
	/** `insert`: the rows given; `update`: the `set` patch. */
	values?: Row | Row[];
	where?: SQL;
}

export interface FindArgs {
	where?: SQL;
	columns?: Record<string, boolean>;
	with?: Record<string, true | FindArgs>;
	orderBy?: SQL | Column | (SQL | Column)[];
	limit?: number;
}

type FindImpl = (args?: FindArgs) => unknown;

/** Rows for a table, or rows plus the query API answers the test wants to script itself. */
export type Fixture = Row[] | { rows?: Row[]; findFirst?: FindImpl; findMany?: FindImpl };

export type Fixtures = Partial<Record<TableKey, Fixture>>;

type TableKey = {
	[K in keyof typeof schema]: (typeof schema)[K] extends Table ? K : never;
}[keyof typeof schema];

const relational = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
const tables = Object.fromEntries(
	(Object.entries(schema) as [string, unknown][]).filter((e): e is [TableKey, Table] =>
		is(e[1], Table),
	),
) as Record<TableKey, Table>;
const keyByName = new Map<string, TableKey>(
	(Object.entries(tables) as [TableKey, Table][]).map(([k, t]) => [getTableName(t), k]),
);

function keyOfTable(table: Table): TableKey {
	const key = keyByName.get(getTableName(table));
	if (!key) throw new Error(`fakeDb: unknown table ${getTableName(table)}`);
	return key;
}

/** The JS key of a column (`accountId`), not its SQL name (`account_id`): rows are JS-shaped. */
function keyOfColumn(column: Column): string {
	const found = Object.entries(getTableColumns(column.table)).find(([, c]) => c === column);
	if (!found) throw new Error(`fakeDb: column ${column.name} is not on its table`);
	return found[0];
}

/** The string chunks of an SQL node joined, trimmed and lower-cased: `count(*)`. */
function rawTextOf(node: SQL): string {
	return node.queryChunks
		.filter((c): c is StringChunk => is(c, StringChunk))
		.map((c) => c.value.join(""))
		.join(" ")
		.trim()
		.toLowerCase();
}

/** The operator text of an SQL node: its string chunks without parens: `=`, `and and`, `is null`. */
function textOf(node: SQL): string {
	return rawTextOf(node).replace(/[()]/g, " ").replace(/\s+/g, " ").trim();
}

const paramValue = (p: unknown) => (is(p, Param) ? p.value : p);

/** The column comparisons drizzle writes, by their operator text: the row's value against the clause's operand or list. */
const COMPARISONS: Record<string, (value: unknown, operand: unknown, list: unknown[]) => boolean> =
	{
		"=": (value, operand) => value === operand,
		"<>": (value, operand) => value !== operand,
		in: (value, _, list) => list.some((p) => paramValue(p) === value),
		"not in": (value, _, list) => !list.some((p) => paramValue(p) === value),
		"is null": (value) => value == null,
		"is not null": (value) => value != null,
		"<": (value, operand) => (value as number) < (operand as number),
		"<=": (value, operand) => (value as number) <= (operand as number),
		">": (value, operand) => (value as number) > (operand as number),
		">=": (value, operand) => (value as number) >= (operand as number),
	};

/** `and`, `or`, `not` and a parenthesised clause, or undefined when the node is none of those. */
function combinator(text: string, nested: SQL[], row: Row): boolean | undefined {
	if (text === "" && nested.length === 1) return matches(nested[0], row);
	if (/^(and ?)+$/.test(text)) return nested.every((n) => matches(n, row));
	if (/^(or ?)+$/.test(text)) return nested.some((n) => matches(n, row));
	if (text === "not" && nested.length === 1) return !matches(nested[0], row);
	return undefined;
}

/** Whether a row satisfies a `where` clause (exported so a test can check what a logged call selected). */
export function matches(where: SQL | undefined, row: Row): boolean {
	if (!where) return true;
	const chunks = where.queryChunks;
	const nested = chunks.filter((c): c is SQL => is(c, SQL));
	const column = chunks.find((c): c is Column => is(c, Column));
	const text = textOf(where);
	if (nested.length > 0 && !column) {
		const combined = combinator(text, nested, row);
		if (combined !== undefined) return combined;
	}
	if (text === "true") return true;
	if (text === "false") return false;
	const compare = column && COMPARISONS[text];
	if (column && compare) {
		const param = chunks.find((c): c is Param => is(c, Param));
		const list = chunks.find((c): c is unknown[] => Array.isArray(c)) ?? [];
		return compare(row[keyOfColumn(column)], param?.value, list);
	}
	throw new Error(
		`fakeDb cannot evaluate "${text || "<no operator>"}"; give the table a findFirst/findMany of its own`,
	);
}

function compare(a: unknown, b: unknown): number {
	const x = a instanceof Date ? a.getTime() : a;
	const y = b instanceof Date ? b.getTime() : b;
	if (x == null || y == null) return x == null ? (y == null ? 0 : 1) : -1;
	return x < y ? -1 : x > y ? 1 : 0;
}

/** Sorts a copy of the rows by `asc(col)`/`desc(col)` terms (a bare column is ascending). */
function order(rows: Row[], orderBy: FindArgs["orderBy"]): Row[] {
	if (!orderBy) return rows;
	const terms = (Array.isArray(orderBy) ? orderBy : [orderBy]).map((term) => {
		if (is(term, Column)) return { key: keyOfColumn(term), desc: false };
		const column = term.queryChunks.find((c): c is Column => is(c, Column));
		if (!column) throw new Error(`fakeDb: cannot order by "${textOf(term)}"`);
		return { key: keyOfColumn(column), desc: textOf(term) === "desc" };
	});
	return [...rows].sort((a, b) => {
		for (const t of terms) {
			const c = compare(a[t.key], b[t.key]);
			if (c !== 0) return t.desc ? -c : c;
		}
		return 0;
	});
}

/** `columns: { id: true }` keeps those; `{ data: false }` drops those; nothing keeps all. */
function project(row: Row, columns?: Record<string, boolean>): Row {
	if (!columns) return { ...row };
	const picked = Object.entries(columns).filter(([, v]) => v);
	if (picked.length > 0) return Object.fromEntries(picked.map(([k]) => [k, row[k]]));
	return Object.fromEntries(Object.entries(row).filter(([k]) => columns[k] !== false));
}

/** A thenable, as drizzle's builders are: the work runs when awaited. */
function thenable<T>(run: () => T) {
	return {
		// oxlint-disable-next-line unicorn/no-thenable -- being awaitable is the point, as drizzle's builders are
		then: <R1 = T, R2 = never>(
			onFulfilled?: ((value: T) => R1 | PromiseLike<R1>) | null,
			onRejected?: ((reason: unknown) => R2 | PromiseLike<R2>) | null,
		) => Promise.resolve().then(run).then(onFulfilled, onRejected),
	};
}

/** The row an insert stores: the values given plus the schema's JS-side defaults. */
function withDefaults(table: Table, values: Row): Row {
	const row: Row = { ...values };
	for (const [key, column] of Object.entries(getTableColumns(table))) {
		if (key in row) continue;
		if (column.defaultFn) row[key] = column.defaultFn();
		else if (column.default !== undefined && !is(column.default, SQL)) row[key] = column.default;
		else if (column.dataType === "date") row[key] = new Date();
		else row[key] = null;
	}
	return row;
}

function fixtureRows(fixture: Fixture | undefined): Row[] {
	const rows = Array.isArray(fixture) ? fixture : (fixture?.rows ?? []);
	return rows.map((r) => ({ ...r }));
}

// fallow-ignore-next-line unused-export -- tests reach it through a dynamic import inside vi.hoisted
export function fakeDb(fixtures: Fixtures = {}) {
	const store = new Map<TableKey, Row[]>();
	const scripted = new Map<TableKey, { findFirst?: FindImpl; findMany?: FindImpl }>();
	const calls: DbCall[] = [];

	function reset(next: Fixtures = {}) {
		calls.length = 0;
		store.clear();
		scripted.clear();
		for (const key of Object.keys(tables) as TableKey[]) {
			const fixture = next[key];
			store.set(key, fixtureRows(fixture));
			if (fixture && !Array.isArray(fixture)) {
				const { findFirst, findMany } = fixture;
				if (findFirst || findMany) scripted.set(key, { findFirst, findMany });
			}
		}
	}
	reset(fixtures);

	const rowsOf = (key: TableKey) => store.get(key) ?? [];

	/** Rows satisfying `args`, ordered, limited, projected, with their relations attached. */
	function find(key: TableKey, args: FindArgs = {}, candidates = rowsOf(key)): Row[] {
		let rows = order(
			candidates.filter((r) => matches(args.where, r)),
			args.orderBy,
		);
		if (args.limit !== undefined) rows = rows.slice(0, args.limit);
		return rows.map((row) => {
			const out = project(row, args.columns);
			for (const [name, sub] of Object.entries(args.with ?? {})) {
				const relation: Relation | undefined = relational.tables[key]?.relations[name];
				if (!relation) throw new Error(`fakeDb: ${key} has no relation "${name}"`);
				const { fields, references } = normalizeRelation(
					relational.tables,
					relational.tableNamesMap,
					relation,
				);
				const relatedKey = keyOfTable(relation.referencedTable);
				const related = rowsOf(relatedKey).filter((r) =>
					fields.every((f, i) => row[keyOfColumn(f)] === r[keyOfColumn(references[i])]),
				);
				const found = find(relatedKey, sub === true ? {} : sub, related);
				if (is(relation, One)) out[name] = found[0] ?? null;
				else if (is(relation, Many)) out[name] = found;
			}
			return out;
		});
	}

	const query = Object.fromEntries(
		(Object.keys(tables) as TableKey[]).map((key) => [
			key,
			{
				findFirst: async (args: FindArgs = {}) => {
					calls.push({ op: "findFirst", table: getTableName(tables[key]), where: args.where });
					const own = scripted.get(key)?.findFirst;
					if (own) return own(args);
					return find(key, { ...args, limit: 1 })[0];
				},
				findMany: async (args: FindArgs = {}) => {
					calls.push({ op: "findMany", table: getTableName(tables[key]), where: args.where });
					const own = scripted.get(key)?.findMany;
					if (own) return own(args);
					return find(key, args);
				},
			},
		]),
	) as Record<TableKey, { findFirst: FindImpl; findMany: FindImpl }>;

	/** `select({ a: t.col, n: sql\`count(*)\` })` over the matching rows; no selection is the whole row. */
	function selectRows(table: Table, fields: Record<string, unknown> | undefined, rows: Row[]) {
		if (!fields) return rows.map((r) => ({ ...r }));
		const counts = Object.entries(fields).filter(
			([, v]) => is(v, SQL) && rawTextOf(v) === "count(*)",
		);
		if (counts.length > 0) return [Object.fromEntries(counts.map(([k]) => [k, rows.length]))];
		return rows.map((r) =>
			Object.fromEntries(
				Object.entries(fields).map(([k, v]) => {
					if (is(v, Column)) {
						if (v.table !== table) throw new Error("fakeDb: selecting from another table");
						return [k, r[keyOfColumn(v)]];
					}
					throw new Error(`fakeDb: cannot select "${is(v, SQL) ? textOf(v) : String(v)}"`);
				}),
			),
		);
	}

	function select(fields?: Record<string, unknown>) {
		return {
			from(table: Table) {
				const state: { where?: SQL; orderBy?: FindArgs["orderBy"]; limit?: number } = {};
				const builder = {
					where(where?: SQL) {
						state.where = where;
						return builder;
					},
					orderBy(...terms: (SQL | Column)[]) {
						state.orderBy = terms;
						return builder;
					},
					limit(n: number) {
						state.limit = n;
						return builder;
					},
					innerJoin(): never {
						throw new Error("fakeDb: joins are not supported");
					},
					leftJoin(): never {
						throw new Error("fakeDb: joins are not supported");
					},
					...thenable(() => {
						calls.push({ op: "select", table: getTableName(table), where: state.where });
						return selectRows(table, fields, find(keyOfTable(table), state));
					}),
				};
				return builder;
			},
		};
	}

	function insert(table: Table) {
		return {
			values(values: Row | Row[]) {
				const run = () => {
					calls.push({ op: "insert", table: getTableName(table), values });
					const rows = (Array.isArray(values) ? values : [values]).map((v) =>
						withDefaults(table, v),
					);
					rowsOf(keyOfTable(table)).push(...rows);
					return rows;
				};
				const builder = {
					onConflictDoNothing: () => builder,
					onConflictDoUpdate: () => builder,
					returning: (fields?: Record<string, unknown>) =>
						thenable(() => selectRows(table, fields, run())),
					...thenable(() => {
						run();
					}),
				};
				return builder;
			},
		};
	}

	function update(table: Table) {
		return {
			set(values: Row) {
				const state: { where?: SQL } = {};
				const run = () => {
					calls.push({ op: "update", table: getTableName(table), values, where: state.where });
					const changed = rowsOf(keyOfTable(table)).filter((r) => matches(state.where, r));
					for (const row of changed) {
						Object.assign(row, values);
						for (const [key, column] of Object.entries(getTableColumns(table)))
							if (column.onUpdateFn && key in row && !(key in values))
								row[key] = column.onUpdateFn();
					}
					return changed;
				};
				const builder = {
					where(where?: SQL) {
						state.where = where;
						return builder;
					},
					returning: (fields?: Record<string, unknown>) =>
						thenable(() => selectRows(table, fields, run())),
					...thenable(() => {
						run();
					}),
				};
				return builder;
			},
		};
	}

	function del(table: Table) {
		return {
			where(where?: SQL) {
				const run = () => {
					calls.push({ op: "delete", table: getTableName(table), where });
					const key = keyOfTable(table);
					const all = rowsOf(key);
					const gone = all.filter((r) => matches(where, r));
					store.set(
						key,
						all.filter((r) => !gone.includes(r)),
					);
					return gone;
				};
				return {
					returning: (fields?: Record<string, unknown>) =>
						thenable(() => selectRows(table, fields, run())),
					...thenable(() => {
						run();
					}),
				};
			},
		};
	}

	return {
		query,
		select,
		insert,
		update,
		delete: del,
		transaction(): never {
			throw new Error("fakeDb: transactions are not supported");
		},
		/** Every operation so far, in order. */
		calls,
		/** The current rows of a table (inserts, updates and deletes applied). */
		rows: rowsOf,
		/** Clears the log and reloads the tables from `fixtures`. */
		reset,
	};
}
