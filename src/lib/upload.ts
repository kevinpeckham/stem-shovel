import { collapseDualMono } from "$lib/audio/mono";
import { computePeaks, PEAK_BINS } from "$lib/audio/peaks";
import { demoContentType } from "$lib/utils/demoContentType";
import { stemContentType } from "$lib/utils/stemContentType";
import { upload } from "@vercel/blob/client";

export interface Reservation {
	stemId: string;
	pathname: string;
}

/**
 * The browser half of a stem upload, shared by "add stems" and "upload new
 * version": send the bytes browser → Blob against a reserved pathname, decode
 * the file locally, and report duration/channels/peaks so the row becomes
 * ready. The caller decides how the reservation is made.
 */
export async function uploadStemFile(
	file: File,
	reserve: () => Promise<Reservation>,
	opts: { ctx: AudioContext; onProgress?: (percent: number) => void; onDecoding?: () => void },
): Promise<void> {
	const { stemId, pathname } = await reserve();
	const contentType = stemContentType(file.name) ?? undefined;
	const blob = await upload(pathname, file, {
		access: "public",
		handleUploadUrl: "/api/upload",
		// The reservation allows exactly the type derived from the extension; the
		// browser's own guess differs ("audio/x-m4a" for a Voice Memo) and would be refused.
		contentType,
		multipart: true,
		onUploadProgress: ({ percentage }) => opts.onProgress?.(percentage),
	});
	opts.onDecoding?.();
	// Channels are reported after the same dual-mono collapse the player does,
	// so a dual-mono file gets a mono rendition.
	const buffer = collapseDualMono(
		await opts.ctx.decodeAudioData(await file.arrayBuffer()),
		opts.ctx,
	);
	const ready = await fetch(`/api/stems/${stemId}/ready`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({
			url: blob.url,
			durationSeconds: buffer.duration,
			channels: buffer.numberOfChannels,
			peaks: Array.from(computePeaks(buffer, PEAK_BINS)),
		}),
	});
	if (!ready.ok) throw new Error(await errorText(ready));
}

export interface DemoReservation {
	demoId: string;
	pathname: string;
}

/** A demo recording: reserve, send the bytes to Blob, report the URL. No decoding. */
export async function uploadDemoFile(
	file: File,
	reserve: () => Promise<DemoReservation>,
	onProgress?: (percent: number) => void,
): Promise<void> {
	const { demoId, pathname } = await reserve();
	const contentType = demoContentType(file.name) ?? undefined;
	const blob = await upload(pathname, file, {
		access: "public",
		handleUploadUrl: "/api/upload",
		// The reservation allows exactly the type derived from the extension; the
		// browser's own guess differs ("audio/x-m4a" for a Voice Memo) and would be refused.
		contentType,
		multipart: true,
		onUploadProgress: ({ percentage }) => onProgress?.(percentage),
	});
	const ready = await fetch(`/api/demos/${demoId}/ready`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ url: blob.url }),
	});
	if (!ready.ok) throw new Error(await errorText(ready));
}

/** A stem's MIDI file: reserve on the stem, send the bytes to Blob, report the URL. */
export async function uploadMidiFile(
	stemId: string,
	file: File,
	onProgress?: (percent: number) => void,
): Promise<void> {
	const { pathname } = await postJson<{ stemId: string; pathname: string }>(
		`/api/stems/${stemId}/midi`,
		{ filename: file.name, sizeBytes: file.size },
	);
	const blob = await upload(pathname, file, {
		access: "public",
		handleUploadUrl: "/api/upload",
		contentType: "audio/midi",
		onUploadProgress: ({ percentage }) => onProgress?.(percentage),
	});
	const ready = await fetch(`/api/stems/${stemId}/midi/ready`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ url: blob.url }),
	});
	if (!ready.ok) throw new Error(await errorText(ready));
}

export async function postJson<T>(path: string, payload: unknown): Promise<T> {
	const res = await fetch(path, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	});
	if (!res.ok) throw new Error(await errorText(res));
	return (await res.json()) as T;
}

async function errorText(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { message?: string; error?: string };
		return body.message ?? body.error ?? `${res.status} ${res.statusText}`;
	} catch {
		return `${res.status} ${res.statusText}`;
	}
}

/**
 * Saves a Blob file under `filename`. The `download` attribute is ignored on
 * cross-origin links and Blob's own `?download=1` names the file by its
 * pathname, so fetch it (CORS is open, and it is usually already in the HTTP
 * cache) and hand the browser an object URL instead.
 */
export async function saveAs(url: string, filename: string): Promise<void> {
	const res = await fetch(url);
	if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
	const a = document.createElement("a");
	a.href = URL.createObjectURL(await res.blob());
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
