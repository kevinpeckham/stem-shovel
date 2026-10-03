import { chordPlayer } from "$lib/audio/chordPlayer.svelte";
import { metronome } from "$lib/audio/metronome.svelte";
import { claimPlayback, releasePlayback } from "$lib/audio/onlyOnePlays";
import { piano } from "$lib/audio/piano.svelte";
import { startLookahead } from "$lib/audio/lookahead";
import {
	beatsFromHold,
	restBeatsFromGap,
	type ChordBeats,
	type ProgressionEntry,
} from "$lib/utils/chordRhythm";
import { encodeChordMidi } from "$lib/utils/encodeChordMidi";
import type { ProgressionData } from "$lib/val/ProgressionSchema";

/**
 * The progression pad (docs/chord-player.md, "The progression pad"): the
 * chords played on the circle, jotted down as they go. A chord's length
 * comes from how long it was held, quantized to one, two or four beats at
 * the metronome's tempo, and a pause before it becomes a rest. The pad
 * plays the progression back through the chord player, with a click of its
 * own in the piano's context, so the chords and the click share one clock;
 * the free-running metronome is the click to jot against. The pad is kept
 * per browser, and a signed-in member saves it to the account by name.
 */
const KEY = "stemshovel.chord-player.";
const MAX_ENTRIES = 400;
const MAX_UNDO = 50;
/** A chord lets go a sixteenth before the next starts, as in the MIDI export. */
const RELEASE_BEATS = 0.25;

interface Hold {
	start: number;
	label: string;
	wedge: string;
	notes: number[];
}

function read(name: string): string | null {
	try {
		return localStorage.getItem(KEY + name);
	} catch {
		return null;
	}
}
function write(name: string, value: string) {
	try {
		localStorage.setItem(KEY + name, value);
	} catch {
		// Private mode: the pad lasts for this page.
	}
}

class ProgressionPad {
	entries = $state<ProgressionEntry[]>([]);
	/** Chords played on the circle are written to the pad. */
	jot = $state(true);
	loop = $state(false);
	/** A click under playback. */
	click = $state(true);
	playing = $state(false);
	/** The entry sounding, for the pad; -1 when stopped. */
	playingIndex = $state(-1);
	/** The entry picked on the pad for editing; -1 for none. */
	selected = $state(-1);
	/** The saved row the pad came from, if any, for Save to update it. */
	savedId = $state<string | null>(null);
	name = $state("");
	#loaded = false;
	#holds = new Map<string, Hold>();
	#lastRelease = 0;
	#undo: ProgressionEntry[][] = [];
	#ctx: AudioContext | null = null;
	#stopLoop: (() => void) | null = null;
	#timers: ReturnType<typeof setTimeout>[] = [];
	#index = 0;
	#nextTime = 0;
	#clickTime = 0;
	#clickBeat = 0;
	#endTimer: ReturnType<typeof setTimeout> | null = null;

	load() {
		if (this.#loaded || typeof window === "undefined") return;
		this.#loaded = true;
		metronome.load();
		this.jot = read("pad-jot") !== "0";
		this.loop = read("pad-loop") === "1";
		this.click = read("pad-click") !== "0";
		try {
			const raw = read("progression");
			if (raw) {
				const saved = JSON.parse(raw) as {
					entries?: ProgressionEntry[];
					savedId?: string | null;
					name?: string;
				};
				if (Array.isArray(saved.entries)) this.entries = saved.entries.slice(0, MAX_ENTRIES);
				this.savedId = saved.savedId ?? null;
				this.name = saved.name ?? "";
			}
		} catch {
			// A pad that does not parse starts empty.
		}
		chordPlayer.listener = {
			down: (by, chord) => this.#down(by, chord),
			up: (by) => this.#up(by),
		};
	}
	#persist() {
		write(
			"progression",
			JSON.stringify({ entries: this.entries, savedId: this.savedId, name: this.name }),
		);
	}
	#set(entries: ProgressionEntry[]) {
		this.#undo = [...this.#undo, this.entries].slice(-MAX_UNDO);
		this.entries = entries;
		if (this.selected >= entries.length) this.selected = -1;
		if (this.playing) this.stop();
		this.#persist();
	}

	/** The beats the pad holds, for the measure count and the length. */
	get totalBeats(): number {
		return this.entries.reduce((n, e) => n + e.beats, 0);
	}
	get canUndo(): boolean {
		return this.#undo.length > 0;
	}
	/** What Save would store: the tempo and meter as they stand, and the entries. */
	get data(): ProgressionData {
		return { bpm: metronome.bpm, beatsPerBar: metronome.beatsPerBar, entries: this.entries };
	}

	// ---- jotting ----
	#down(by: string, chord: { label: string; wedge: string; notes: number[] }) {
		if (!this.jot || this.playing || by.startsWith("pad:")) return;
		const now = performance.now();
		// A chord pressed while another is still down ends the first there: legato, no rest between.
		for (const held of this.#holds.keys()) this.#finish(held, now);
		if (this.entries.length > 0 && this.#lastRelease > 0) {
			const rest = restBeatsFromGap(now - this.#lastRelease, metronome.bpm);
			if (rest !== 0) this.#append({ kind: "rest", beats: rest });
		}
		this.#holds.set(by, { start: now, label: chord.label, wedge: chord.wedge, notes: chord.notes });
	}
	#up(by: string) {
		if (!this.#holds.has(by)) return;
		this.#finish(by, performance.now());
	}
	#finish(by: string, at: number) {
		const hold = this.#holds.get(by);
		if (!hold) return;
		this.#holds.delete(by);
		this.#lastRelease = at;
		this.#append({
			kind: "chord",
			label: hold.label,
			wedge: hold.wedge,
			notes: hold.notes,
			beats: beatsFromHold(at - hold.start, metronome.bpm),
		});
	}
	#append(entry: ProgressionEntry) {
		if (this.entries.length >= MAX_ENTRIES) return;
		this.#set([...this.entries, entry]);
	}

	// ---- editing ----
	setJot(on: boolean) {
		this.jot = on;
		this.#holds.clear();
		write("pad-jot", on ? "1" : "0");
	}
	setLoop(on: boolean) {
		this.loop = on;
		write("pad-loop", on ? "1" : "0");
	}
	setClick(on: boolean) {
		this.click = on;
		write("pad-click", on ? "1" : "0");
	}
	select(index: number) {
		this.selected = this.selected === index ? -1 : index;
	}
	setBeats(index: number, beats: ChordBeats) {
		const entry = this.entries[index];
		if (!entry || entry.beats === beats) return;
		this.#set(this.entries.map((e, i) => (i === index ? { ...e, beats } : e)));
	}
	/** A rest of the same length in an entry's place, for a chord; a chord cannot come back from a rest (undo does that). */
	toRest(index: number) {
		const entry = this.entries[index];
		if (!entry || entry.kind === "rest") return;
		this.#set(this.entries.map((e, i) => (i === index ? { kind: "rest", beats: e.beats } : e)));
	}
	removeAt(index: number) {
		if (!this.entries[index]) return;
		this.#set(this.entries.filter((_, i) => i !== index));
		this.selected = -1;
	}
	undo() {
		const last = this.#undo.pop();
		if (!last) return;
		this.entries = last;
		this.selected = -1;
		if (this.playing) this.stop();
		this.#persist();
	}
	clear() {
		if (this.entries.length === 0) return;
		this.#set([]);
		this.selected = -1;
		this.savedId = null;
		this.name = "";
		this.#persist();
	}
	/** A saved progression (or a fresh one) onto the pad: its tempo and meter too. */
	open(data: ProgressionData, saved: { id: string; name: string } | null) {
		this.#set(data.entries.slice(0, MAX_ENTRIES));
		metronome.setBpm(data.bpm);
		metronome.setBeats(data.beatsPerBar);
		this.savedId = saved?.id ?? null;
		this.name = saved?.name ?? "";
		this.selected = -1;
		this.#persist();
	}
	/** After a save: the pad is the row now. */
	saved(row: { id: string; name: string }) {
		this.savedId = row.id;
		this.name = row.name;
		this.#persist();
	}
	/** The saved row is gone: the pad keeps its chords, unattached. */
	detach(id: string) {
		if (this.savedId !== id) return;
		this.savedId = null;
		this.#persist();
	}

	// ---- playback ----
	async play() {
		if (this.playing || this.entries.length === 0) return;
		claimPlayback(this);
		chordPlayer.allOff();
		piano.warm();
		const ctx = piano.output().context as AudioContext;
		this.#ctx = ctx;
		if (ctx.state !== "running") await ctx.resume().catch(() => {});
		this.#holds.clear();
		this.#index = 0;
		this.#nextTime = ctx.currentTime + 0.1;
		this.#clickTime = this.#nextTime;
		this.#clickBeat = 0;
		this.playing = true;
		this.#stopLoop = startLookahead(ctx, this.#schedule);
	}
	stop() {
		releasePlayback(this);
		this.#stopLoop?.();
		this.#stopLoop = null;
		for (const t of this.#timers) clearTimeout(t);
		this.#timers = [];
		if (this.#endTimer) clearTimeout(this.#endTimer);
		this.#endTimer = null;
		for (let i = 0; i < this.entries.length; i++) chordPlayer.release(`pad:${i}`);
		this.playing = false;
		this.playingIndex = -1;
	}
	toggle() {
		if (this.playing) this.stop();
		else void this.play();
	}
	#at(time: number, fn: () => void) {
		const ctx = this.#ctx;
		if (!ctx) return;
		const delay = Math.max(0, (time - ctx.currentTime) * 1000);
		this.#timers.push(setTimeout(fn, delay));
		if (this.#timers.length > 64) this.#timers = this.#timers.slice(-48);
	}
	#tick(at: number, accent: boolean) {
		const ctx = this.#ctx;
		if (!ctx) return;
		const osc = ctx.createOscillator();
		const gain = ctx.createGain();
		osc.frequency.value = accent ? 1200 : 800;
		gain.gain.setValueAtTime(0.0001, at);
		gain.gain.exponentialRampToValueAtTime(accent ? 0.5 : 0.3, at + 0.002);
		gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.05);
		osc.connect(gain).connect(ctx.destination);
		osc.start(at);
		osc.stop(at + 0.06);
	}
	#schedule = (until: number) => {
		const beat = 60 / metronome.bpm;
		// The click, a beat at a time, the bar's first higher, up to the end of the progression (or for ever, looping).
		const end = this.#nextTime + this.#remainingBeats() * beat;
		while (this.click && this.#clickTime < until && (this.loop || this.#clickTime < end - 1e-6)) {
			this.#tick(this.#clickTime, this.#clickBeat === 0);
			this.#clickTime += beat;
			this.#clickBeat = (this.#clickBeat + 1) % metronome.beatsPerBar;
		}
		while (this.#nextTime < until) {
			if (this.#index >= this.entries.length) {
				if (!this.loop) {
					if (!this.#endTimer) {
						const ctx = this.#ctx!;
						this.#endTimer = setTimeout(
							() => this.stop(),
							Math.max(0, (this.#nextTime - ctx.currentTime) * 1000),
						);
						this.#stopLoop?.();
						this.#stopLoop = null;
					}
					return;
				}
				this.#index = 0;
			}
			const i = this.#index;
			const entry = this.entries[i];
			const start = this.#nextTime;
			const length = entry.beats * beat;
			this.#at(start, () => (this.playingIndex = i));
			if (entry.kind === "chord") {
				const by = `pad:${i}`;
				this.#at(start, () => chordPlayer.sound(by, entry));
				this.#at(start + Math.max(length - RELEASE_BEATS * beat, length / 2), () =>
					chordPlayer.release(by),
				);
			}
			this.#nextTime = start + length;
			this.#index = i + 1;
		}
	};
	#remainingBeats(): number {
		let n = 0;
		for (let i = this.#index; i < this.entries.length; i++) n += this.entries[i].beats;
		return n;
	}

	/** The progression as a Standard MIDI File, to save. */
	midi(): Blob {
		return encodeChordMidi(this.entries, metronome.bpm, metronome.beatsPerBar);
	}
}

export const progressionPad = new ProgressionPad();
