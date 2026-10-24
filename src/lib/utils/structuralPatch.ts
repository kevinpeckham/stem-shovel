/**
 * A structural diff and patch for plain JSON documents (the Studio's
 * arrangement, docs/multitrack-recorder.md "Scale and structure"): the
 * undo stack (audio/undoStack.ts) keeps one whole snapshot and turns each
 * older one into the patch from its successor, so a long session holds
 * the edits rather than a hundred copies of the song.
 *
 * A patch is a plain JSON value, `null` when nothing changed, else one of:
 *
 * - `{ t: "s", v }` sets the value whole (a primitive, a new key, a type
 *   change, an array without ids that differs anywhere: a lane's points);
 * - `{ t: "o", k?, d? }` patches an object key by key: `k` maps each
 *   changed key to its own patch, `d` lists the keys that went away;
 * - `{ t: "a", r?, o?, i?, c? }` patches an array of objects that each
 *   carry a unique string `id` (tracks, clips, markers, buses) by id: `r`
 *   lists the removed ids, `o` the survivors' new order when it changed,
 *   `i` the new elements as `[index in the result, element]` pairs in
 *   ascending order, and `c` maps a surviving id to its element's patch.
 *
 * So a change costs the size of what changed: moving one clip of five
 * hundred is `{t:"o",k:{clips:{t:"a",c:{<id>:{t:"o",k:{start:{t:"s",v:…}}}}}}}`,
 * and only a reorder of an id array spells out its ids. A field holding
 * `undefined` counts as absent (as JSON.stringify has it). Both functions
 * are pure; `applyPatch` returns a new document that shares every
 * unchanged subtree with its input (and the values inside the patch), so
 * neither may be mutated afterwards.
 */

/** A JSON value; an object member may be `undefined`, which counts as absent. */
export type Json = null | boolean | number | string | Json[] | { [key: string]: Json | undefined };

type JsonObject = { [key: string]: Json | undefined };
type Keyed = JsonObject & { id: string };

type ObjectPatch = { t: "o"; k?: { [key: string]: Patch }; d?: string[] };
type ListPatch = {
	t: "a";
	r?: string[];
	o?: string[];
	i?: [number, Json][];
	c?: { [id: string]: Patch };
};
export type Patch = null | { t: "s"; v: Json } | ObjectPatch | ListPatch;

/** The patch that turns `from` into `to`; `null` when they are equal. */
export function patchBetween(from: Json, to: Json): Patch {
	if (from === to) return null;
	if (Array.isArray(from) && Array.isArray(to)) {
		if (keyedById(from) && keyedById(to)) return listPatch(from, to);
		return sameList(from, to) ? null : { t: "s", v: to };
	}
	if (isObject(from) && isObject(to)) return objectPatch(from, to);
	return { t: "s", v: to };
}

/** `doc` with `patch` applied, as a new document (`doc` is left as it was). */
export function applyPatch(doc: Json, patch: Patch): Json {
	if (patch === null) return doc;
	if (patch.t === "s") return patch.v;
	if (patch.t === "o") {
		if (!isObject(doc)) throw new Error("applyPatch: an object patch on a non-object");
		return applyObjectPatch(doc, patch);
	}
	if (!Array.isArray(doc)) throw new Error("applyPatch: a list patch on a non-array");
	return applyListPatch(doc as Keyed[], patch);
}

function applyObjectPatch(doc: JsonObject, patch: ObjectPatch): JsonObject {
	const out: JsonObject = {};
	const gone = new Set(patch.d ?? []);
	for (const [key, value] of Object.entries(doc)) {
		if (value !== undefined && !gone.has(key)) put(out, key, value);
	}
	for (const [key, p] of Object.entries(patch.k ?? {})) {
		const before = Object.hasOwn(out, key) ? out[key] : undefined;
		if (before === undefined && (p === null || p.t !== "s")) {
			throw new Error(`applyPatch: a patch for the missing key ${key}`);
		}
		put(out, key, applyPatch(before as Json, p));
	}
	return out;
}

function applyListPatch(doc: Keyed[], patch: ListPatch): Json[] {
	const removed = new Set(patch.r ?? []);
	const survivors = doc.filter((e) => !removed.has(e.id));
	let list: Json[] = survivors;
	if (patch.o) {
		const byId = new Map(survivors.map((e) => [e.id, e]));
		list = patch.o.map((id) => {
			const e = byId.get(id);
			if (!e) throw new Error(`applyPatch: no element ${id} to reorder`);
			return e;
		});
	}
	for (const [index, element] of patch.i ?? []) list.splice(index, 0, element);
	const changes = patch.c;
	if (!changes) return list;
	return list.map((e) => {
		const id = (e as Keyed).id;
		return Object.hasOwn(changes, id) ? applyPatch(e, changes[id]) : e;
	});
}

function isObject(value: Json | undefined): value is JsonObject {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** An array whose elements are all objects with unique string ids (an empty array qualifies). */
function keyedById(list: Json[]): list is Keyed[] {
	const seen = new Set<string>();
	for (const e of list) {
		if (!isObject(e) || typeof e.id !== "string" || seen.has(e.id)) return false;
		seen.add(e.id);
	}
	return true;
}

function sameList(a: Json[], b: Json[]): boolean {
	return a.length === b.length && a.every((e, i) => patchBetween(e, b[i]) === null);
}

function objectPatch(from: JsonObject, to: JsonObject): Patch {
	const k: { [key: string]: Patch } = {};
	for (const [key, value] of Object.entries(to)) {
		const p = keyPatch(from[key], value);
		if (p !== null) put(k, key, p);
	}
	const d = Object.keys(from).filter((key) => from[key] !== undefined && to[key] === undefined);
	const changed = Object.keys(k).length > 0;
	if (!changed && d.length === 0) return null;
	return { t: "o", ...(changed ? { k } : {}), ...(d.length ? { d } : {}) };
}

/** One key's patch: a key that was absent is set whole; an absent value in `to` is no patch (its removal is `d`). */
function keyPatch(before: Json | undefined, value: Json | undefined): Patch {
	if (value === undefined) return null;
	if (before === undefined) return { t: "s", v: value };
	return patchBetween(before, value);
}

function listPatch(from: Keyed[], to: Keyed[]): Patch {
	const fromById = new Map(from.map((e) => [e.id, e]));
	const toIds = new Set(to.map((e) => e.id));
	const r = from.filter((e) => !toIds.has(e.id)).map((e) => e.id);
	const before = from.filter((e) => toIds.has(e.id)).map((e) => e.id);
	const after = to.filter((e) => fromById.has(e.id)).map((e) => e.id);
	const reordered = before.some((id, n) => id !== after[n]);
	const i: [number, Json][] = [];
	const c: { [id: string]: Patch } = {};
	let changed = false;
	to.forEach((e, index) => {
		const old = fromById.get(e.id);
		if (!old) {
			i.push([index, e]);
			return;
		}
		const p = patchBetween(old, e);
		if (p === null) return;
		put(c, e.id, p);
		changed = true;
	});
	if (!r.length && !reordered && !i.length && !changed) return null;
	return {
		t: "a",
		...(r.length ? { r } : {}),
		...(reordered ? { o: after } : {}),
		...(i.length ? { i } : {}),
		...(changed ? { c } : {}),
	};
}

/** Sets a key as an own data property (a key named `__proto__` included). */
function put<V>(target: { [key: string]: V }, key: string, value: V) {
	Object.defineProperty(target, key, {
		value,
		enumerable: true,
		writable: true,
		configurable: true,
	});
}
