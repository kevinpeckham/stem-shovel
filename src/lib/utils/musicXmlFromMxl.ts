import { unzipSync } from "fflate";

/**
 * The score inside a compressed MusicXML file (`.mxl`, a zip): the
 * rootfile `META-INF/container.xml` names, else the first XML that is not
 * under META-INF. Null when the zip holds no score.
 */
export function musicXmlFromMxl(bytes: Uint8Array): string | null {
	let files: Record<string, Uint8Array>;
	try {
		files = unzipSync(bytes);
	} catch {
		return null;
	}
	const decoder = new TextDecoder();
	const container = files["META-INF/container.xml"];
	const named = container
		? decoder.decode(container).match(/<rootfile\b[^>]*\bfull-path="([^"]+)"/)?.[1]
		: undefined;
	const path =
		named && files[named]
			? named
			: Object.keys(files).find(
					(name) => !name.startsWith("META-INF/") && /\.(musicxml|xml)$/i.test(name),
				);
	return path ? decoder.decode(files[path]!) : null;
}
