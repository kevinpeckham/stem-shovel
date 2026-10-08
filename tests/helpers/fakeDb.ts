import * as schema from "#lib/server/db/schema/index.js";
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
 * (`vi.mock("#lib/server/db/index.js", () => ({ db: fake, schema }))`). Rows live in
 * memory per table, keyed by the schema's export name (`idea`,
 * `studioRevision`…), and every operation is logged in `calls` for the test
 * to assert on. It is a test double, not an ORM: it evaluates the `where`
 * clauses this codebase writes (`eq`, `ne`, `and`, `or`, `not`, `inArray`,
 * `notInArray`, `isNull`, `isNotNull`, `<`, `>`, `<=`, `>=`, and a column
 * against a column, `like`, and a raw `sql\`…\`` predicate of `is null`, `=`,
 * `!=`, `<`…, `and`/`or`/`not`, parentheses, `lower()`, `trim()`, quoted and
 * interpolated values, and `exists`/`not exists` over a `db.select()`
 * subquery whose where may name the outer table) against JS rows, orders by
 * `asc`/`desc`, applies `limit` and `offset`, projects `columns`, resolves
 * `with` through the
 * schema's own relations, and knows the aggregates `sql\`count(*)\`` (and
 * drizzle's `count()`),
 * `sql\`sum(${col})\`` and `sql\`max(${col})\`` in a select (one row, or
 * one per `groupBy` key; `sum` and `max` of nothing are null). A select may
 * `innerJoin` another table on an `eq` of two columns; the where and the
 * selected columns then read each table's own row. Anything else throws,
 * naming the clause, and the test can give that table a
 * `findFirst`/`findMany` of its own instead.
 *
 * Inserted rows get the column defaults the schema declares in JS
 * (`$defaultFn` ids, literal defaults, required timestamps as `new Date()`,
 * optional ones null); an
 * update refreshes an `$onUpdate` column only when the row carries it, so a
 * fixture without `updatedAt` stays comparable with `toEqual`, and an update
 * to `sql\`${col} + 1\`` adds to the row's value. Transactions and left
 * joins are not supported.
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
	offset?: number;
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

/** On a joined row: each table's own row, by SQL table name, so `id` of either side can be read. */
const JOINED = Symbol("joined");
type JoinedRow = Row & { [JOINED]?: Map<string, Row> };

/** The row's value for a column; on a joined row, the value from that column's table. */
function valueOf(row: Row, column: Column): unknown {
	const part = (row as JoinedRow)[JOINED]?.get(getTableName(column.table));
	return (part ?? row)[keyOfColumn(column)];
}

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
		like: (value, operand) => typeof value === "string" && likePattern(String(operand)).test(value),
	};

/** SQL's `like` pattern as a regular expression: `%` any run, `_` one character, the rest literal. */
function likePattern(pattern: string): RegExp {
	const source = pattern
		.split(/([%_])/)
		.map((part, i) =>
			i % 2 === 0 ? part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : part === "%" ? "[^]*" : "[^]",
		)
		.join("");
	return new RegExp(`^${source}$`);
}

/** A select builder's hidden runner for `exists ${subquery}`: the rows it finds with the outer row's tables in view (a correlated where). */
const SUBQUERY = Symbol("subquery");
type Subquery = { [SUBQUERY]?: (outer: Row) => Row[] };

/** The rows a `exists ${subquery}` token's select finds for the outer row. */
function subqueryRows(token: RawToken | undefined, outer: Row): Row[] {
	const run = token && "value" in token ? (token.value as Subquery | null)?.[SUBQUERY] : undefined;
	if (!run) throw new Error("fakeDb: exists needs a select subquery");
	return run(outer);
}

/** `left <op> right` of a raw predicate, with SQL's null rule (a comparison with null is not true). */
function rawCompare(left: unknown, op: RawToken | undefined, right: unknown): boolean {
	if (!op || !("op" in op)) throw new Error("fakeDb: a raw predicate needs an operator");
	const compare = COMPARISONS[op.op === "!=" ? "<>" : op.op];
	if (!compare) throw new Error(`fakeDb: unknown raw operator "${op.op}"`);
	return left != null && right != null && compare(left, right, []);
}

/** The clause's operand: its bound Param, or a raw string or number (`like` interpolates its pattern raw). */
function operandOf(chunks: unknown[]): unknown {
	const param = chunks.find((c): c is Param => is(c, Param));
	if (param) return param.value;
	return chunks.find((c) => typeof c === "string" || typeof c === "number");
}

/** The row with its own table named, so a subquery's `eq(inner.col, outer.col)` can read it. */
function tagged(table: Table, row: Row): Row {
	if ((row as JoinedRow)[JOINED]) return row;
	return { ...row, [JOINED]: new Map([[getTableName(table), row]]) } as Row;
}

/** `and`, `or`, `not` and a parenthesised clause, or undefined when the node is none of those. */
function combinator(text: string, nested: SQL[], row: Row): boolean | undefined {
	if (text === "" && nested.length === 1) return matches(nested[0], row);
	if (/^(and ?)+$/.test(text)) return nested.every((n) => matches(n, row));
	if (/^(or ?)+$/.test(text)) return nested.some((n) => matches(n, row));
	if (text === "not" && nested.length === 1) return !matches(nested[0], row);
	return undefined;
}

/** A token of a raw `sql\`…\`` predicate: an operator word, a column, or a value (quoted, numeric or interpolated). */
type RawToken = { op: string } | { column: Column } | { value: unknown };
const RAW_SPLIT =
	/(is not null|is null|!=|<>|<=|>=|=|<|>|\(|\)|\bor\b|\band\b|\bnot\b|\bexists\b|\blower\b|\btrim\b|'[^']*'|-?\d+(?:\.\d+)?)/i;

/** The tokens of a raw predicate, or undefined when a string chunk holds something else (a function the fake does not know). */
function rawTokens(node: SQL): RawToken[] | undefined {
	const out: RawToken[] = [];
	for (const chunk of node.queryChunks) {
		if (is(chunk, StringChunk)) {
			for (const [i, part] of chunk.value.join("").split(RAW_SPLIT).entries()) {
				if (i % 2 === 0) {
					if (part.trim() !== "") return undefined;
				} else if (part.startsWith("'")) out.push({ value: part.slice(1, -1) });
				else if (/^-?\d/.test(part)) out.push({ value: Number(part) });
				else out.push({ op: part.toLowerCase().replace(/\s+/g, " ") });
			}
		} else if (is(chunk, Column)) out.push({ column: chunk });
		else if (is(chunk, SQL)) {
			const inner = rawTokens(chunk);
			if (!inner) return undefined;
			out.push(...inner);
		} else if (Array.isArray(chunk)) return undefined;
		else out.push({ value: paramValue(chunk) });
	}
	return out;
}

/**
 * Evaluates a raw `sql\`…\`` predicate this codebase writes (`(${col} is null or
 * ${col} != ${key})`, `lower(${col}) = lower(${name})`, `${col} < ${ms}`) against
 * the row, with SQL's null rule (a comparison with null is not true); undefined
 * when the clause is not of that shape.
 */
function rawPredicate(where: SQL, row: Row): boolean | undefined {
	const tokens = rawTokens(where);
	if (!tokens) return undefined;
	let i = 0;
	const takeOp = (op: string) => {
		const t = tokens[i];
		if (t && "op" in t && t.op === op) {
			i++;
			return true;
		}
		return false;
	};
	const expect = (op: string) => {
		if (!takeOp(op)) throw new Error(`fakeDb: expected "${op}" in a raw predicate`);
	};
	const operand = (): unknown => {
		const t = tokens[i++];
		if (!t) throw new Error("fakeDb: a raw predicate ends early");
		if ("column" in t) return valueOf(row, t.column);
		if ("value" in t) return t.value;
		if (t.op === "lower" || t.op === "trim") {
			expect("(");
			const v = operand();
			expect(")");
			if (typeof v !== "string") return v;
			return t.op === "lower" ? v.toLowerCase() : v.trim();
		}
		throw new Error(`fakeDb: unexpected "${t.op}" in a raw predicate`);
	};
	const comparison = (): boolean => {
		if (takeOp("not")) return !comparison();
		if (takeOp("exists")) return subqueryRows(tokens[i++], row).length > 0;
		if (takeOp("(")) {
			const v = disjunction();
			expect(")");
			return v;
		}
		const left = operand();
		if (takeOp("is null")) return left == null;
		if (takeOp("is not null")) return left != null;
		const op = tokens[i++];
		return rawCompare(left, op, operand());
	};
	const conjunction = (): boolean => {
		let v = comparison();
		while (takeOp("and")) v = comparison() && v;
		return v;
	};
	const disjunction = (): boolean => {
		let v = conjunction();
		while (takeOp("or")) v = conjunction() || v;
		return v;
	};
	const result = disjunction();
	if (i !== tokens.length) throw new Error("fakeDb: a raw predicate has tokens left over");
	return result;
}

/** `col = ?`, `col in (…)`, `col like ?`, `col1 = col2`…: the clause's first column against its operand, or undefined when the clause is not one of those. */
function columnComparison(where: SQL, row: Row): boolean | undefined {
	const chunks = where.queryChunks;
	const columns = chunks.filter((c): c is Column => is(c, Column));
	const compare = columns[0] && COMPARISONS[textOf(where)];
	if (!columns[0] || !compare) return undefined;
	const list = chunks.find((c): c is unknown[] => Array.isArray(c)) ?? [];
	const operand =
		columns.length === 2 && !chunks.some((c) => is(c, Param))
			? valueOf(row, columns[1])
			: operandOf(chunks);
	return compare(valueOf(row, columns[0]), operand, list);
}

/** Whether a row satisfies a `where` clause (exported so a test can check what a logged call selected). */
export function matches(where: SQL | undefined, row: Row): boolean {
	if (!where) return true;
	const chunks = where.queryChunks;
	const nested = chunks.filter((c): c is SQL => is(c, SQL));
	const text = textOf(where);
	if (nested.length > 0 && !chunks.some((c) => is(c, Column))) {
		const combined = combinator(text, nested, row);
		if (combined !== undefined) return combined;
	}
	if (text === "true") return true;
	if (text === "false") return false;
	const compared = columnComparison(where, row);
	if (compared !== undefined) return compared;
	const raw = rawPredicate(where, row);
	if (raw !== undefined) return raw;
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
		else if (column.dataType === "date" && column.notNull) row[key] = new Date();
		else row[key] = null;
	}
	return row;
}

/** The value an update stores: the patch's own, or `sql\`${col} + n\`` worked out against the row. */
function patched(row: Row, value: unknown): unknown {
	if (!is(value, SQL)) return value;
	const column = value.queryChunks.find((c): c is Column => is(c, Column));
	const added = /^\+ (\d+)$/.exec(textOf(value));
	if (column && added) return Number(valueOf(row, column) ?? 0) + Number(added[1]);
	throw new Error(`fakeDb: cannot update to "${textOf(value)}"`);
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
			candidates.filter((r) => matches(args.where, tagged(tables[key], r))),
			args.orderBy,
		);
		if (args.offset) rows = rows.slice(args.offset);
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

	/** `count(*)`, `sum(col)` or `max(col)` over the rows, or undefined when the field is not an aggregate. */
	function aggregate(field: unknown, rows: Row[]): { value: unknown } | undefined {
		if (!is(field, SQL)) return undefined;
		const text = textOf(field);
		const star = field.queryChunks.some((c) => is(c, SQL) && rawTextOf(c) === "*");
		if (text === "count *" || (text === "count" && star)) return { value: rows.length };
		const column = field.queryChunks.find((c): c is Column => is(c, Column));
		if (!column || (text !== "sum" && text !== "max")) return undefined;
		const values = rows.map((r) => valueOf(r, column)).filter((v): v is number => v != null);
		if (values.length === 0) return { value: null };
		return { value: text === "sum" ? values.reduce((a, b) => a + b, 0) : Math.max(...values) };
	}

	/** One row's value for a selected field: its column (from the right table on a joined row). */
	function fieldOf(table: Table, field: unknown, row: Row): unknown {
		if (is(field, Column)) {
			if (field.table !== table && !(row as JoinedRow)[JOINED])
				throw new Error("fakeDb: selecting from another table");
			return valueOf(row, field);
		}
		throw new Error(`fakeDb: cannot select "${is(field, SQL) ? textOf(field) : String(field)}"`);
	}

	/**
	 * `select({ a: t.col, n: sql\`count(*)\` })` over the matching rows; no selection is the whole
	 * row. With an aggregate the answer is one row (per `groupBy` key when grouped), the plain
	 * columns read from the group's first row.
	 */
	function selectRows(
		table: Table,
		fields: Record<string, unknown> | undefined,
		rows: Row[],
		groupBy: Column[] = [],
	): Row[] {
		if (!fields) return rows.map((r) => ({ ...r }));
		const aggregated = Object.values(fields).some((v) => aggregate(v, []) !== undefined);
		if (!aggregated)
			return rows.map((r) =>
				Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, fieldOf(table, v, r)])),
			);
		const groups = new Map<string, Row[]>();
		if (groupBy.length === 0) groups.set("", rows);
		for (const row of rows) {
			if (groupBy.length === 0) break;
			const key = JSON.stringify(groupBy.map((c) => valueOf(row, c)));
			groups.set(key, [...(groups.get(key) ?? []), row]);
		}
		return [...groups.values()].map((group) =>
			Object.fromEntries(
				Object.entries(fields).map(([k, v]) => {
					const agg = aggregate(v, group);
					return [k, agg ? agg.value : group[0] ? fieldOf(table, v, group[0]) : undefined];
				}),
			),
		);
	}

	function select(fields?: Record<string, unknown>) {
		return {
			from(table: Table) {
				const state: {
					where?: SQL;
					orderBy?: FindArgs["orderBy"];
					limit?: number;
					offset?: number;
					groupBy: Column[];
					joins: { table: Table; on: SQL }[];
				} = { groupBy: [], joins: [] };
				/** The rows to select from: the table's own, each paired with every row of each joined table its `on` accepts. */
				const candidates = () =>
					state.joins.reduce<Row[]>(
						(rows, join) =>
							rows.flatMap((left) =>
								rowsOf(keyOfTable(join.table))
									.map((right) => {
										const parts = new Map(
											(left as JoinedRow)[JOINED] ?? [[getTableName(table), left]],
										);
										parts.set(getTableName(join.table), right);
										return { ...left, ...right, [JOINED]: parts } as Row;
									})
									.filter((row) => matches(join.on, row)),
							),
						rowsOf(keyOfTable(table)),
					);
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
					offset(n: number) {
						state.offset = n;
						return builder;
					},
					groupBy(...columns: Column[]) {
						state.groupBy = columns;
						return builder;
					},
					innerJoin(joined: Table, on: SQL) {
						state.joins.push({ table: joined, on });
						return builder;
					},
					leftJoin(): never {
						throw new Error("fakeDb: left joins are not supported");
					},
					/** As `exists ${subquery}` in a raw predicate: this select's rows with the outer row's tables in view. */
					[SUBQUERY]: (outer: Row) =>
						candidates().filter((r) => {
							const parts = new Map((outer as JoinedRow)[JOINED] ?? []);
							parts.set(getTableName(table), r);
							return matches(state.where, { ...outer, ...r, [JOINED]: parts } as Row);
						}),
					...thenable(() => {
						calls.push({ op: "select", table: getTableName(table), where: state.where });
						const { where, orderBy, limit, offset } = state;
						return selectRows(
							table,
							fields,
							find(keyOfTable(table), { where, orderBy, limit, offset }, candidates()),
							state.groupBy,
						);
					}),
				};
				return builder;
			},
		};
	}

	function insert(table: Table) {
		return {
			values(values: Row | Row[]) {
				/** The conflict target's columns and, for an upsert, the patch; a conflict is a stored row equal on every target column. */
				const conflict: { target?: Column[]; set?: Row } = {};
				const targetOf = (opts?: { target?: Column | Column[] }) =>
					opts?.target ? (Array.isArray(opts.target) ? opts.target : [opts.target]) : undefined;
				const run = () => {
					calls.push({ op: "insert", table: getTableName(table), values });
					const all = rowsOf(keyOfTable(table));
					const rows: Row[] = [];
					for (const v of Array.isArray(values) ? values : [values]) {
						const clash = conflict.target?.length
							? all.find((r) =>
									conflict.target?.every((c) => r[keyOfColumn(c)] === v[keyOfColumn(c)]),
								)
							: undefined;
						if (clash) {
							if (!conflict.set) continue;
							for (const [key, value] of Object.entries(conflict.set))
								clash[key] = patched(clash, value);
							rows.push(clash);
							continue;
						}
						const row = withDefaults(table, v);
						all.push(row);
						rows.push(row);
					}
					return rows;
				};
				const builder = {
					onConflictDoNothing: (opts?: { target?: Column | Column[] }) => {
						conflict.target = targetOf(opts);
						conflict.set = undefined;
						return builder;
					},
					onConflictDoUpdate: (opts: { target: Column | Column[]; set: Row }) => {
						conflict.target = targetOf(opts);
						conflict.set = opts.set;
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

	function update(table: Table) {
		return {
			set(values: Row) {
				const state: { where?: SQL } = {};
				const run = () => {
					calls.push({ op: "update", table: getTableName(table), values, where: state.where });
					const changed = rowsOf(keyOfTable(table)).filter((r) => matches(state.where, r));
					for (const row of changed) {
						for (const [key, value] of Object.entries(values)) row[key] = patched(row, value);
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
