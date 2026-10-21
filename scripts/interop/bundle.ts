/**
 * A session bundle and a DAWproject from the fixture song
 * (scripts/interop/fixture.ts), through the same `exportSong` the page
 * uses. Writes `.interop/bundle/` (the bundle unzipped, so a DAW reads
 * the files), `.interop/song.dawproject` and `.interop/arrangement.json`
 * for the runners to judge against.
 *
 *   bun scripts/interop/bundle.ts
 */
import { unzipSync } from "fflate";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { exportSong } from "#lib/audio/studioExport.js";
import { arrangement, engine, songEnd } from "./fixture";

const out = ".interop";
mkdirSync(join(out, "bundle"), { recursive: true });
const files = await exportSong(
	engine,
	"Interop song",
	{
		mix: false,
		tracks: false,
		buses: false,
		dawproject: true,
		bundle: true,
		sandyne: false,
		format: "wav",
		bits: 24,
		normalize: false,
	},
	{ name: "Stem Shovel Dawn", version: "interop" },
	(step) => console.log(step),
);
for (const f of files) {
	if (f.entries) {
		const zip = unzipSync(new Uint8Array(await f.blob.arrayBuffer()));
		for (const [name, data] of Object.entries(zip)) {
			const path = join(out, "bundle", name);
			mkdirSync(dirname(path), { recursive: true });
			writeFileSync(path, data);
		}
		console.log(`${Object.keys(zip).length} files in ${join(out, "bundle")}`);
	} else {
		const path = join(out, f.name.replace(/^.*\./, "song."));
		writeFileSync(path, new Uint8Array(await f.blob.arrayBuffer()));
		console.log(path);
	}
}
writeFileSync(
	join(out, "arrangement.json"),
	JSON.stringify({ ...arrangement, songEnd }, null, "\t"),
);
