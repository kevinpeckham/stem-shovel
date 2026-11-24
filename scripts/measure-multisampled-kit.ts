/**
 * A built-in multisampled kit's list (docs/drum-machine.md, "Multisampled
 * kits"): every file in static/kits/<id>/ named `<voice> V<layer> RR<rr>.<ext>`
 * (or plain `<voice>.<ext>`, a single-sample kit's file, as V5 RR1),
 * each measured for its maximum momentary loudness, written to
 * src/lib/audio/kits/multisampled/<id>.json, which the player loads (no
 * guessing at file names; the velocity layer plan needs the loudness).
 *
 *   bun run measure:multisampled-kit           # every sampled kit in DRUM_KITS
 *   bun run measure:multisampled-kit <id> ...  # just these
 *
 * Run it whenever a kit's files change, and once for a new kit after its
 * folder and its DRUM_KITS entry are in. ffmpeg (ffmpeg-static) decodes each
 * file to 48 kHz stereo floats: a mono file becomes dual mono, as the
 * browser measures it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { DRUM_KITS } from "../src/lib/constants/expressionDrums";
import { DRUM_VOICE_IDS } from "../src/lib/constants/drumMachine";
import { maxMomentaryLoudness } from "../src/lib/utils/maxMomentaryLoudness";

const NAME = /^(.+) V([1-5]) RR(\d+)\.(flac|wav|mp3|m4a|aac|ogg|opus)$/i;
/** A single-sample kit's file (the drum machine's own folders: `kick.wav`), taken as V5 RR1. */
const SINGLE = /^(.+)\.(flac|wav|mp3|m4a|aac|ogg|opus)$/i;
function slot(file: string): { voice: string; layer: number; rr: number } | null {
	const m = NAME.exec(file);
	if (m) return { voice: m[1]!, layer: Number(m[2]), rr: Number(m[3]) };
	const s = SINGLE.exec(file);
	return s ? { voice: s[1]!, layer: 5, rr: 1 } : null;
}
// A synthesized kit has no files to measure.
const ids = process.argv.slice(2).length
	? process.argv.slice(2)
	: DRUM_KITS.filter((k) => !("synthesized" in k)).map((k) => k.id);

for (const id of ids) {
	const dir = join("static/kits", id);
	if (!existsSync(dir)) throw new Error(`no folder ${dir}`);
	const out = join("src/lib/audio/kits/multisampled", `${id}.json`);
	type Entry = { layer: number; rr: number; file: string; loudness: number | null };
	const samples: Record<string, Entry[]> = {};
	let skipped = 0;
	for (const file of readdirSync(dir).sort()) {
		const m = slot(file);
		if (!m || !(DRUM_VOICE_IDS as readonly string[]).includes(m.voice)) {
			if (!file.startsWith(".")) console.warn(`  skipped (not <voice> V<n> RR<n>.<ext> or <voice>.<ext>): ${file}`);
			skipped++;
			continue;
		}
		const run = spawnSync(
			ffmpegPath!,
			["-v", "error", "-i", join(dir, file), "-f", "f32le", "-acodec", "pcm_f32le", "-ac", "2", "-ar", "48000", "-"],
			{ maxBuffer: 256 * 1024 * 1024 },
		);
		if (run.status !== 0) throw new Error(`ffmpeg failed on ${file}: ${run.stderr.toString()}`);
		const pcm = new Float32Array(run.stdout.buffer, run.stdout.byteOffset, run.stdout.byteLength / 4);
		const left = new Float32Array(pcm.length / 2);
		const right = new Float32Array(pcm.length / 2);
		for (let i = 0; i < left.length; i++) {
			left[i] = pcm[2 * i]!;
			right[i] = pcm[2 * i + 1]!;
		}
		const lufs = maxMomentaryLoudness([left, right], 48000);
		(samples[m.voice] ??= []).push({
			layer: m.layer,
			rr: m.rr,
			file,
			loudness: Number.isFinite(lufs) ? Math.round(lufs * 100) / 100 : null,
		});
	}
	for (const list of Object.values(samples)) list.sort((a, b) => b.layer - a.layer || a.rr - b.rr);
	writeFileSync(out, `${JSON.stringify(samples, null, "\t")}\n`);
	const count = Object.values(samples).reduce((n, l) => n + l.length, 0);
	console.log(`${id}: ${count} files measured into ${out}${skipped ? `, ${skipped} skipped` : ""}`);
	for (const [voice, list] of Object.entries(samples)) {
		const loudest = [5, 4, 3, 2, 1].map((l) => {
			const vals = list.filter((s) => s.layer === l && s.loudness !== null).map((s) => s.loudness!);
			return vals.length ? Math.max(...vals).toFixed(1).padStart(6) : "     —";
		});
		console.log(`  ${voice.padEnd(11)} loudest V5..V1: ${loudest.join(" ")}`);
	}
}
