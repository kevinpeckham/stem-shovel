import { piano } from "$lib/audio/piano.svelte";
import {
	CHROMATIC_NOTES,
	CIRCLE_OF_FIFTHS,
	STRUMS,
	type ChordQuality,
	type ChordVoicing,
	type CirclePosition,
	type SeventhType,
	type Strum,
} from "$lib/constants/circleOfFifths";
import { chordMidi, chordName, noteMidi } from "$lib/utils/chordNotes";

/**
 * The chord player (docs/chord-player.md): the circle of fifths played
 * through the piano engine. A press on a wedge holds a chord's notes down
 * on the piano and a release lets them go, so the piano's sound, effects,
 * sustain and presets apply as they do to its keys. Several pointers can
 * hold several chords. Settings are remembered per browser.
 */
export interface SoundingChord {
	/** The pointer or key holding it. */
	by: string;
	/** The wedge lit for it: a chord's id ("C", "Am") or "note:<index>". */
	wedge: string;
	name: string;
	notes: number[];
}

const KEY = "stemshovel.chord-player.";
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
		// Private mode: the setting lasts for this page.
	}
}

class ChordPlayerEngine {
	/** Chords on the wedges, or single notes. */
	mode = $state<"chords" | "notes">("chords");
	voicing = $state<ChordVoicing>("standard");
	seventhType = $state<SeventhType>("dominant");
	/** The momentary seventh: the 7 pad or Shift, held. */
	seventhHeld = $state(false);
	strum = $state<Strum>("off");
	/** How hard a wedge is pressed, 0.2 to 1. */
	velocity = $state(0.8);
	/** The octave of notes mode's notes and of a chord's root (4: middle C's). */
	octave = $state(4);
	/** The key at the top: a circle index (0 = C). */
	keyCenter = $state(0);
	keyAtTop = $state(true);
	showSignatures = $state(true);
	/** The computer keyboard's keys on the wedges (the piano's key labels toggle). */
	showKeys = $state(false);
	/** What is sounding, by who holds it, for the screen. */
	sounding = $state<SoundingChord[]>([]);
	/** Roman numerals on the diatonic wedges, and the rest dimmed, for the key center (the Circle menu). */
	showNumerals = $state(false);
	highlightKey = $state(false);
	/** The progression pad listens to presses and releases to jot them (docs/chord-player.md, "The progression pad"). */
	listener: {
		down(by: string, chord: { label: string; wedge: string; notes: number[] }): void;
		up(by: string): void;
	} | null = null;
	#loaded = false;
	#timers = new Map<string, ReturnType<typeof setTimeout>[]>();

	load() {
		if (this.#loaded || typeof window === "undefined") return;
		this.#loaded = true;
		const mode = read("mode");
		if (mode === "chords" || mode === "notes") this.mode = mode;
		const voicing = read("voicing");
		if (voicing && ["standard", "spread", "rich", "bass", "rootBass"].includes(voicing))
			this.voicing = voicing as ChordVoicing;
		const seventh = read("seventh-type");
		if (seventh === "dominant" || seventh === "major7") this.seventhType = seventh;
		const strum = read("strum");
		if (strum && STRUMS.some((s) => s.id === strum)) this.strum = strum as Strum;
		const velocity = Number(read("velocity"));
		if (Number.isFinite(velocity) && velocity >= 0.2 && velocity <= 1) this.velocity = velocity;
		const octave = Number(read("octave"));
		if (Number.isInteger(octave) && octave >= 2 && octave <= 6) this.octave = octave;
		const key = Number(read("key-center"));
		if (Number.isInteger(key) && key >= 0 && key < 12) this.keyCenter = key;
		this.keyAtTop = read("key-at-top") !== "0";
		this.showSignatures = read("signatures") !== "0";
		this.showKeys = read("keys") === "1";
		this.showNumerals = read("numerals") === "1";
		this.highlightKey = read("highlight") === "1";
		piano.load();
	}

	/** The positions as drawn: the key center's at the top (or the bottom), the rest clockwise in fifths. */
	get positions(): CirclePosition[] {
		const offset = this.keyAtTop ? this.keyCenter : (this.keyCenter + 6) % 12;
		return CIRCLE_OF_FIFTHS.map((_, i) => CIRCLE_OF_FIFTHS[(i + offset) % 12]);
	}
	/** The notes of notes mode, chromatic clockwise from the key center's root. */
	get notes(): { pitch: number; label: string }[] {
		const root = CIRCLE_OF_FIFTHS[this.keyCenter].major.pitch;
		const from = this.keyAtTop ? root : (root + 6) % 12;
		return CHROMATIC_NOTES.map((_, i) => {
			const pitch = (from + i) % 12;
			return { pitch, label: CHROMATIC_NOTES[pitch] };
		});
	}

	/** A wedge pressed: the chord (or note) sounds until `release(by)`. */
	press(drawnIndex: number, quality: ChordQuality, by: string, seventh = false) {
		this.release(by);
		piano.warm();
		let notes: number[];
		let name: string;
		let wedge: string;
		if (this.mode === "notes") {
			const note = this.notes[drawnIndex];
			notes = [noteMidi(note.pitch, this.octave)];
			name = `${note.label}${this.octave}`;
			wedge = `note:${drawnIndex}`;
		} else {
			const position = this.positions[drawnIndex];
			const chord = position[quality];
			wedge = chord.id;
			const type = seventh || this.seventhHeld ? this.seventhType : null;
			notes = chordMidi({
				pitch: chord.pitch,
				quality,
				seventh: type,
				voicing: this.voicing,
				octave: this.octave,
			});
			name = chordName(chord.label, quality, type);
		}
		const gap = STRUMS.find((s) => s.id === this.strum)?.ms ?? 0;
		// More notes, each a little softer, so a rich voicing sums to about a triad's level (the limiter after the effects catches the rest).
		const velocity = this.velocity * Math.min(1, Math.sqrt(3 / notes.length));
		const timers: ReturnType<typeof setTimeout>[] = [];
		notes.forEach((midi, i) => {
			if (gap === 0 || i === 0) piano.noteOn(midi, velocity);
			else timers.push(setTimeout(() => piano.noteOn(midi, velocity), gap * i));
		});
		this.#timers.set(by, timers);
		this.sounding = [...this.sounding, { by, wedge, name, notes }];
		this.listener?.down(by, { label: name, wedge, notes });
	}
	/** The chord held by `by` stops (its notes, unless another holder shares one). */
	release(by: string) {
		const held = this.sounding.find((s) => s.by === by);
		if (!held) return;
		for (const t of this.#timers.get(by) ?? []) clearTimeout(t);
		this.#timers.delete(by);
		const rest = this.sounding.filter((s) => s.by !== by);
		const stillHeld = new Set(rest.flatMap((s) => s.notes));
		for (const midi of held.notes) if (!stillHeld.has(midi)) piano.noteOff(midi);
		this.sounding = rest;
		this.listener?.up(by);
	}
	/** A jotted chord played back by the pad: its notes as they were, held until `release(by)`. */
	sound(by: string, chord: { label: string; wedge: string; notes: number[] }) {
		this.release(by);
		const velocity = this.velocity * Math.min(1, Math.sqrt(3 / chord.notes.length));
		for (const midi of chord.notes) piano.noteOn(midi, velocity);
		this.sounding = [
			...this.sounding,
			{ by, wedge: chord.wedge, name: chord.label, notes: chord.notes },
		];
	}
	/** Everything off: leaving the page, Escape, the window losing focus. */
	allOff() {
		for (const timers of this.#timers.values()) for (const t of timers) clearTimeout(t);
		this.#timers.clear();
		const held = this.sounding.map((s) => s.by);
		this.sounding = [];
		piano.allOff();
		for (const by of held) this.listener?.up(by);
	}

	setMode(mode: "chords" | "notes") {
		this.allOff();
		this.mode = mode;
		write("mode", mode);
	}
	setVoicing(voicing: ChordVoicing) {
		this.voicing = voicing;
		write("voicing", voicing);
	}
	setSeventhType(type: SeventhType) {
		this.seventhType = type;
		write("seventh-type", type);
	}
	setStrum(strum: Strum) {
		this.strum = strum;
		write("strum", strum);
	}
	setVelocity(v: number) {
		this.velocity = Math.max(0.2, Math.min(1, Math.round(v * 100) / 100));
		write("velocity", String(this.velocity));
	}
	setOctave(octave: number) {
		this.octave = Math.max(2, Math.min(6, Math.round(octave)));
		write("octave", String(this.octave));
	}
	setKeyCenter(index: number) {
		this.keyCenter = ((index % 12) + 12) % 12;
		write("key-center", String(this.keyCenter));
	}
	setKeyAtTop(on: boolean) {
		this.keyAtTop = on;
		write("key-at-top", on ? "1" : "0");
	}
	setShowKeys(on: boolean) {
		this.showKeys = on;
		write("keys", on ? "1" : "0");
	}
	setShowSignatures(on: boolean) {
		this.showSignatures = on;
		write("signatures", on ? "1" : "0");
	}
	setShowNumerals(on: boolean) {
		this.showNumerals = on;
		write("numerals", on ? "1" : "0");
	}
	setHighlightKey(on: boolean) {
		this.highlightKey = on;
		write("highlight", on ? "1" : "0");
	}
	/** The key center's drawn index: the top, or the bottom. */
	get keyIndex(): number {
		return this.keyAtTop ? 0 : 6;
	}
}

export const chordPlayer = new ChordPlayerEngine();
