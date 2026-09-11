/**
 * Generates four synthetic mono WAV stems (20 s, 32 kHz, 16-bit) plus a
 * manifest into static/stems/, so the test page works before you have real
 * bounces. Deliberately different lengths to exercise the "shorter stem" path.
 *
 * Usage: node scripts/make-test-stems.mjs
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const RATE = 32000;
const BPM = 100;
const BEAT = 60 / BPM;
const OUT = join(process.cwd(), "static", "stems");

/** Render `seconds` of audio by calling `fn(t)` per sample and write a 16-bit WAV. */
function writeWav(name, seconds, fn) {
	const frames = Math.round(seconds * RATE);
	const pcm = new Int16Array(frames);
	for (let i = 0; i < frames; i++) {
		const v = Math.max(-1, Math.min(1, fn(i / RATE)));
		pcm[i] = Math.round(v * 32767);
	}
	const data = Buffer.from(pcm.buffer);
	const header = Buffer.alloc(44);
	header.write("RIFF", 0);
	header.writeUInt32LE(36 + data.length, 4);
	header.write("WAVE", 8);
	header.write("fmt ", 12);
	header.writeUInt32LE(16, 16); // PCM chunk size
	header.writeUInt16LE(1, 20); // PCM format
	header.writeUInt16LE(1, 22); // mono
	header.writeUInt32LE(RATE, 24);
	header.writeUInt32LE(RATE * 2, 28); // byte rate
	header.writeUInt16LE(2, 32); // block align
	header.writeUInt16LE(16, 34); // bits per sample
	header.write("data", 36);
	header.writeUInt32LE(data.length, 40);
	writeFileSync(join(OUT, name), Buffer.concat([header, data]));
}

// Simple deterministic noise so hats sound the same on every run
let seed = 1;
const noise = () => {
	seed = (seed * 16807) % 2147483647;
	return seed / 2147483647 - 0.5;
};
const env = (t, attack, decay) => (t < attack ? t / attack : Math.exp(-(t - attack) / decay));
const note = (midi) => 440 * 2 ** ((midi - 69) / 12);

mkdirSync(OUT, { recursive: true });

// Kick: sine that sweeps from ~150 Hz down to 50 Hz on every beat.
// The phase is the *integral* of the frequency sweep, measured from the start
// of each hit; multiplying a time-varying frequency by absolute time instead
// makes the pitch run away (a chirp), because d/dt[f(t)·t] = f + t·f'.
writeWav("kick.wav", 20, (t) => {
	const pos = t % BEAT;
	const base = 50; // Hz the hit settles to
	const sweep = 100; // extra Hz at the start of the hit
	const rate = 30; // how fast the sweep decays (1/s)
	const phase = 2 * Math.PI * (base * pos + (sweep / rate) * (1 - Math.exp(-rate * pos)));
	return 0.9 * env(pos, 0.002, 0.14) * Math.sin(phase);
});

// Hats: noise bursts on eighths, accented on the offbeat
writeWav("hats.wav", 20, (t) => {
	const eighth = BEAT / 2;
	const pos = t % eighth;
	const accent = Math.floor(t / eighth) % 2 === 1 ? 0.35 : 0.2;
	return accent * env(pos, 0.001, 0.03) * noise();
});

// Bass: D2 root with a fifth on beat 3 — 18 s so it ends before the others
writeWav("bass.wav", 18, (t) => {
	const bar = t % (BEAT * 4);
	const midi = bar >= BEAT * 2 && bar < BEAT * 3 ? 45 : 38; // A2 on beat 3, else D2
	const pos = t % BEAT;
	return 0.5 * env(pos, 0.005, 0.35) * Math.sin(2 * Math.PI * note(midi) * t);
});

// Keys: D major triad pad, slow attack, slightly detuned for width
writeWav("keys.wav", 20, (t) => {
	const chord = [62, 66, 69]; // D4 F#4 A4
	let v = 0;
	for (const m of chord) {
		v += Math.sin(2 * Math.PI * note(m) * t) + 0.5 * Math.sin(2 * Math.PI * (note(m) * 1.003) * t);
	}
	return 0.12 * Math.min(1, t / 1.5) * v;
});

const manifest = {
	title: "Test loop in D",
	stems: [
		{ id: "kick", label: "Kick", url: "/stems/kick.wav" },
		{ id: "hats", label: "Hats", url: "/stems/hats.wav" },
		{ id: "bass", label: "Bass", url: "/stems/bass.wav" },
		{ id: "keys", label: "Keys", url: "/stems/keys.wav" },
	],
};
writeFileSync(join(OUT, "manifest.json"), `${JSON.stringify(manifest, null, "\t")}\n`);
console.log(`Wrote 4 stems + manifest to ${OUT}`);
