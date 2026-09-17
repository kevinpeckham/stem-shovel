import type { SongDocKind } from "$lib/val/SongDocKindSchema";

/**
 * Whether the reader wants a document kind in monospace (chord grids line up)
 * or regular text, remembered per browser (localStorage), not per song.
 * Off by default; the panel's ⋯ menu toggles it.
 */
const KEY = "stemshovel.docMono";

export type DocMono = Record<SongDocKind, boolean>;

export const DEFAULT_DOC_MONO: DocMono = { chart: false, lyrics: false, notes: false };

export function loadDocMono(): DocMono {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULT_DOC_MONO };
		const parsed = JSON.parse(raw) as Partial<Record<string, unknown>>;
		return {
			chart: parsed.chart === true,
			lyrics: parsed.lyrics === true,
			notes: parsed.notes === true,
		};
	} catch {
		return { ...DEFAULT_DOC_MONO };
	}
}

export function saveDocMono(mono: DocMono): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(mono));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}
