import { zipSync, type Zippable } from "fflate";

/** A file for a zip: its path inside and its bytes. */
export interface ZipEntry {
	name: string;
	data: Uint8Array | ArrayBuffer | Blob;
	/** Deflate it (text, say); audio is already dense and is stored as it is. */
	compress?: boolean;
}

/**
 * Files into one zip, in the browser (fflate's synchronous zip, all in
 * memory: an export of a song's stems, docs/dawn-daw-plan.md D3). The
 * same bytes with a `.dawproject` name are a DAWproject.
 */
export async function zipBlobs(entries: ZipEntry[], type = "application/zip"): Promise<Blob> {
	const files: Zippable = {};
	for (const e of entries) {
		const bytes =
			e.data instanceof Blob
				? new Uint8Array(await e.data.arrayBuffer())
				: e.data instanceof ArrayBuffer
					? new Uint8Array(e.data)
					: e.data;
		files[e.name] = [bytes, { level: e.compress ? 6 : 0 }];
	}
	return new Blob([zipSync(files)], { type });
}
