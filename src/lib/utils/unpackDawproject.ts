import { strFromU8, unzipSync } from "fflate";
import { readDawproject, type DawprojectRead } from "./dawprojectRead";

/**
 * A `.dawproject` file's bytes opened: the archive unzipped (or a bare
 * `project.xml` saved with the extension, as some examples are), its
 * project and metadata read into Dawn's shape (dawprojectRead.ts), and a
 * lookup for the audio files the project names, tolerant of a folder
 * prefix inside the archive and of `./` paths. Dawn's import and the
 * converter page share it. Throws when there is no project.xml.
 */
export function unpackDawproject(
	bytes: Uint8Array,
	fileName: string,
): { read: DawprojectRead; entryOf: (path: string) => Uint8Array | undefined } {
	const baseName = fileName.replace(/\.(dawproject|zip)$/i, "");
	const bare = bytes[0] !== 0x50 || bytes[1] !== 0x4b;
	const entries: Record<string, Uint8Array> = bare ? { "project.xml": bytes } : unzipSync(bytes);
	const names = Object.keys(entries);
	const projectName = names.find((n) => /(^|\/)project\.xml$/.test(n));
	if (!projectName) throw new Error(`${fileName} holds no project.xml: not a DAWproject`);
	const prefix = projectName.slice(0, -"project.xml".length);
	const metaName = names.find((n) => n === `${prefix}metadata.xml`);
	const read = readDawproject(
		strFromU8(entries[projectName]!),
		metaName ? strFromU8(entries[metaName]!) : null,
		baseName,
	);
	const entryOf = (path: string) => {
		const clean = path.replace(/^\.\//, "");
		return (
			entries[`${prefix}${clean}`] ??
			entries[clean] ??
			entries[names.find((n) => n.endsWith(`/${clean}`)) ?? ""]
		);
	};
	return { read, entryOf };
}
