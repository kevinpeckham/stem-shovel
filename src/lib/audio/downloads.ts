import { saveAs } from "$lib/upload";
import type { StemEngine } from "$lib/audio/engine.svelte";

/** The song page's and the home demo's downloads: the mixes and the zip of stems. */
export type MixMode = "original" | "custom";

/**
 * The query for `/api/songs/<id>/mix`: nothing for the original mix; the
 * audible stems with their gains for a custom one, or null when nothing is
 * audible (the caller tells the user to unmute something).
 */
export function mixQuery(mode: MixMode, engine?: StemEngine | null): string | null {
	if (mode !== "custom") return "";
	const mix = engine?.mix() ?? { stems: [], master: 1 };
	if (mix.stems.length === 0) return null;
	const params = new URLSearchParams();
	params.set("stems", mix.stems.map((s) => `${s.id}:${s.gain.toFixed(3)}`).join(","));
	params.set("master", mix.master.toFixed(3));
	return `?${params}`;
}

/** Saves `<name>-mix.mp3` or `<name>-custom-mix.mp3`; throws with the server's message. */
export async function saveMix(songId: string, name: string, mode: MixMode, query: string) {
	await saveAs(
		`/api/songs/${songId}/mix${query}`,
		`${name}-${mode === "custom" ? "custom-mix" : "mix"}.mp3`,
	);
}

/** Zips the stems in the browser, fetching each file as the archive is written. */
export async function saveStemsZip(
	stems: { url: string; filename: string; label: string }[],
	name: string,
) {
	const { downloadZip } = await import("client-zip");
	const seen = new Set<string>();
	async function* entries() {
		for (const s of stems) {
			let filename = s.filename;
			if (seen.has(filename)) filename = `${s.label}-${filename}`;
			seen.add(filename);
			const res = await fetch(s.url);
			if (!res.ok) throw new Error(`${s.label}: ${res.status} ${res.statusText}`);
			yield { name: filename, input: res };
		}
	}
	const blob = await downloadZip(entries()).blob();
	const a = document.createElement("a");
	a.href = URL.createObjectURL(blob);
	a.download = `${name}-stems.zip`;
	a.click();
	setTimeout(() => URL.revokeObjectURL(a.href), 60_000);
}
