/**
 * Every DAWproject (or bare project.xml named .dawproject) in a folder
 * through Dawn's reader, one line each: what came in, which audio files
 * the archive lacks, what was dropped (docs/dawproject-plan.md, phase 3).
 *
 *   bun scripts/dawproject-probe.ts <folder> [name filter]
 *
 * The reader needs a DOMParser; jsdom's stands in. The corpus is not in
 * the repo: Bitwig's reference suite writes its projects with
 * `./gradlew test` (github.com/bitwig/dawproject, target/), DawVert
 * converts Reaper and Ableton projects (github.com/DawVert/DawVert), and
 * the real Bitwig exports live on GitHub (github.com/gmlewis).
 */
import { JSDOM } from "jsdom";
import { unzipSync, strFromU8 } from "fflate";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { readDawproject } from "#lib/utils/dawprojectRead.js";
globalThis.DOMParser = new JSDOM("").window.DOMParser as unknown as typeof DOMParser;
const dir = process.argv[2]!;
const only = process.argv[3];
const show = (name: string, project: string, metadata: string | null, entries: string[]) => {
	try {
		const r = readDawproject(project, metadata, name.replace(/\.(dawproject|xml)$/i, ""));
		const a = r.arrangement;
		const missing = r.files
			.filter(
				(f) =>
					!entries.includes(f.path) &&
					!entries.some((e) => e.endsWith("/" + f.path.replace(/^\.\//, ""))),
			)
			.map((f) => f.path);
		console.log(
			`${name}: bpm=${a.bpm} m=${a.beatsPerBar} tracks=${a.tracks.length} buses=${a.buses?.length ?? 0} clips=${a.clips.length} (audio ${a.clips.filter((c) => c.sourceId).length}, notes ${a.clips.filter((c) => c.notes).length}) files=${r.files.length}${missing.length ? ` MISSING ${missing.join(",")}` : ""} markers=${a.markers?.length ?? 0} tempo=${a.tempoChanges?.length ?? 0} auto=${a.tracks.filter((t) => t.automation).length}`,
		);
		console.log(
			`   clips: ${a.clips
				.slice(0, 4)
				.map(
					(c) =>
						`${c.name}@${c.start}+${c.duration}${c.offset ? ` off${c.offset}` : ""}${c.fadeIn || c.fadeOut ? ` f${c.fadeIn}/${c.fadeOut}` : ""}${c.notes ? ` n${c.notes.length}` : ""}`,
				)
				.join(", ")}`,
		);
		if (r.dropped.length)
			console.log(
				`   dropped: ${r.dropped.slice(0, 6).join(" | ")}${r.dropped.length > 6 ? ` … +${r.dropped.length - 6}` : ""}`,
			);
	} catch (e) {
		console.log(`${name}: ERROR ${e instanceof Error ? e.message : e}`);
	}
};
for (const f of readdirSync(dir).sort()) {
	if (only && !f.includes(only)) continue;
	if (!f.endsWith(".dawproject")) continue;
	const bytes = new Uint8Array(readFileSync(join(dir, f)));
	if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
		show(f, strFromU8(bytes), null, []);
		continue;
	}
	const z = unzipSync(bytes);
	const names = Object.keys(z);
	const p = names.find((n) => /(^|\/)project\.xml$/.test(n));
	const m = names.find((n) => /(^|\/)metadata\.xml$/.test(n));
	if (p) show(f, strFromU8(z[p]!), m ? strFromU8(z[m]!) : null, names);
}
