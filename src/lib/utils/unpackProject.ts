import { gunzipSync, strFromU8, unzipSync } from "fflate";
import { readAls } from "./alsRead";
import type { DawprojectRead } from "./dawprojectRead";
import { readRpp } from "./rppRead";
import { unpackDawproject } from "./unpackDawproject";

export type ProjectFormat = "dawproject" | "reaper" | "ableton";

export interface UnpackedProject {
	read: DawprojectRead;
	format: ProjectFormat;
	/** The bytes of a file the project names, by its path; else by its name alone, in the archive or among the loose files. */
	entryOf: (path: string) => Uint8Array | undefined;
}

const REAPER_HEAD = "<REAPER_PROJECT";

/**
 * A project file opened, whichever kind: a `.dawproject` (or a zip holding
 * one; utils/unpackDawproject.ts), a Reaper `.rpp` (utils/rppRead.ts) or
 * an Ableton Live set `.als` (gzipped XML, or the XML itself;
 * utils/alsRead.ts), bare or inside a zip with its media (a Live project
 * folder zipped, say). The converter and Dawn's import take any. A
 * Reaper project or a Live set names its media by path and carries none,
 * so the media come as `loose` files (dropped beside it, by name) or in
 * the zip; `entryOf` finds a file by its path (a Live set's relative to
 * the set's own folder), then by its name alone. Throws when the bytes
 * are none of these.
 */
export function unpackProject(
	bytes: Uint8Array,
	fileName: string,
	loose: Map<string, Uint8Array> = new Map(),
): UnpackedProject {
	const baseName = fileName.replace(/\.(dawproject|zip|rpp|als)$/i, "");
	const byName = (entries: Record<string, Uint8Array>, path: string) => {
		const clean = path.replace(/^\.\//, "");
		const name = clean.replace(/^.*[\\/]/, "");
		const names = Object.keys(entries);
		return (
			entries[clean] ??
			entries[names.find((n) => n.endsWith(`/${clean}`)) ?? ""] ??
			loose.get(name) ??
			entries[names.find((n) => n === name || n.endsWith(`/${name}`)) ?? ""]
		);
	};
	const head = strFromU8(bytes.slice(0, REAPER_HEAD.length));
	if (head === REAPER_HEAD || (/\.rpp$/i.test(fileName) && bytes[0] !== 0x50)) {
		return {
			read: readRpp(strFromU8(bytes), baseName),
			format: "reaper",
			entryOf: (path) => byName({}, path),
		};
	}
	const gzipped = bytes[0] === 0x1f && bytes[1] === 0x8b;
	const alsText = (b: Uint8Array) => strFromU8(b[0] === 0x1f && b[1] === 0x8b ? gunzipSync(b) : b);
	if (
		gzipped ||
		/\.als$/i.test(fileName) ||
		/^\s*<\?xml/.test(head) ||
		head.startsWith("<Ableton")
	) {
		return {
			read: readAls(alsText(bytes), baseName),
			format: "ableton",
			entryOf: (path) => byName({}, path),
		};
	}
	const zipped = bytes[0] === 0x50 && bytes[1] === 0x4b;
	const entries = zipped ? unzipSync(bytes) : {};
	const names = Object.keys(entries);
	const als = names.find((n) => /\.als$/i.test(n) && !/(^|\/)Backup\//.test(n));
	if (zipped && als && !names.some((n) => /(^|\/)project\.xml$/.test(n))) {
		const prefix = als.replace(/[^/]*$/, "");
		return {
			read: readAls(alsText(entries[als]!), als.replace(/^.*\//, "").replace(/\.als$/i, "")),
			format: "ableton",
			entryOf: (path) =>
				byName(entries, `${prefix}${path.replace(/^\.\//, "")}`) ?? byName(entries, path),
		};
	}
	const rpp = names.find((n) => /\.rpp$/i.test(n));
	if (zipped && rpp && !names.some((n) => /(^|\/)project\.xml$/.test(n))) {
		const prefix = rpp.replace(/[^/]*$/, "");
		return {
			read: readRpp(strFromU8(entries[rpp]!), rpp.replace(/^.*\//, "").replace(/\.rpp$/i, "")),
			format: "reaper",
			entryOf: (path) =>
				byName(entries, `${prefix}${path.replace(/^\.\//, "")}`) ?? byName(entries, path),
		};
	}
	const unpacked = unpackDawproject(bytes, fileName);
	return {
		read: unpacked.read,
		format: "dawproject",
		entryOf: (path) => unpacked.entryOf(path) ?? byName({}, path),
	};
}
