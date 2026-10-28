import { readBlob } from "#lib/server/blob.js";

/**
 * The first bytes of a file as stored, for the ready routes' signature
 * checks (an attachment's, an event file's, a notation file's, a session
 * recording's); a second try a moment later, since the CDN can lag a fresh
 * upload. Null when there is nothing to read. Without `atLeast` it is the
 * first chunk the store sends; with it, chunks are read until that many
 * bytes have come (or all of the file, when it is shorter).
 */
export async function headOfBlob(url: string, atLeast = 0): Promise<Uint8Array | null> {
	for (let attempt = 0; attempt < 2; attempt++) {
		const res = await readBlob(url).catch(() => null);
		if (res?.ok && res.body) {
			const reader = res.body.getReader();
			const head =
				atLeast > 0 ? await readAtLeast(reader, atLeast) : ((await reader.read()).value ?? null);
			await reader.cancel().catch(() => {});
			return head;
		}
		await new Promise((r) => setTimeout(r, 1000));
	}
	return null;
}

/** Chunks until `want` bytes have come or the stream ends, joined. */
async function readAtLeast(
	reader: ReadableStreamDefaultReader<Uint8Array>,
	want: number,
): Promise<Uint8Array> {
	const chunks: Uint8Array[] = [];
	let length = 0;
	while (length < want) {
		const { value, done } = await reader.read();
		if (done || !value) break;
		chunks.push(value);
		length += value.length;
	}
	const head = new Uint8Array(length);
	let offset = 0;
	for (const c of chunks) {
		head.set(c, offset);
		offset += c.length;
	}
	return head;
}
