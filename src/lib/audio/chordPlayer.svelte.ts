import { piano } from "$lib/audio/piano.svelte";
import {
	CHORD_KEY_CODES,
	CHORD_KEY_LABELS,
	CHROMATIC_NOTES,
	CIRCLE_OF_FIFTHS,
	DEGREE_KEY_CODES,
	DEGREE_KEY_LABELS,
	STRUMS,
	type ChordKeyMap,
	type ChordQuality,
	type ChordVoicing,
	type CirclePosition,
	type SeventhType,
	type Strum,
} from "$lib/constants/circleOfFifths";
import {
	CHORD_RECIPES,
	CHORD_STYLES,
	type ChordRecipe,
	type ChordStyleId,
} from "$lib/constants/chordStyles";
import type { ChordStyleData, SavedChordStyle } from "$lib/val/ChordStyleSchema";
import type { ChordPresetSettings } from "$lib/val/PianoPresetSchema";
import { noteMidi, voiceChord } from "$lib/utils/chordNotes";
import { spellChord, type SpelledNote } from "$lib/utils/noteSpelling";

/** The notes under the chord name in the readout: written, on a staff, both (the staff above the names), or off. */
export type NoteReadout = "names" | "staff" | "both" | "off";
import { styledChord, styledChordName } from "$lib/utils/styledChord";

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
	/** What the wedges carry by degree: triads, or a blues, jazz or lush set of sevenths and extensions, or a saved custom style as "custom:<id>" (docs/chord-player.md, "Styles"). */
	style = $state<string>("plain");
	/** The account's custom styles, from the page. */
	customStyles = $state<SavedChordStyle[]>([]);
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
	/** Off until switched on (Kevin): the key at the bottom, and the arch a bowl. */
	keyAtTop = $state(false);
	/** Off until switched on (Kevin). */
	showSignatures = $state(false);
	/** The computer keyboard's keys on the wedges (the piano's key labels toggle). */
	showKeys = $state(false);
	/** The circle, or the arch: the key and its neighbours big across the top, the far keys small in the corners, the tritone left out. */
	layout = $state<"circle" | "arch">("arch");
	/** The computer keyboard: around the circle from the key, or by degree (1 to 7 are I to VII). */
	keyMap = $state<ChordKeyMap>("degree");
	/** What is sounding, by who holds it, for the screen. */
	sounding = $state<SoundingChord[]>([]);
	/** The notes under the chord name in the readout: written, on a staff, or not at all (the UI menu). */
	noteReadout = $state<NoteReadout>("both");
	/** Roman numerals on every wedge relative to the key (the device's numerals toggle), and the chords outside the key dimmed (the Circle menu). */
	showNumerals = $state(false);
	/** On until switched off (Kevin). */
	highlightKey = $state(true);
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
		const style = read("style");
		if (style && (style.startsWith("custom:") || CHORD_STYLES.some((s) => s.id === style)))
			this.style = style;
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
		this.keyAtTop = read("key-at-top") === "1";
		this.showSignatures = read("signatures") === "1";
		this.showKeys = read("keys") === "1";
		if (read("layout") === "circle") this.layout = "circle";
		if (read("key-map") === "circle") this.keyMap = "circle";
		const readout = read("note-readout");
		if (readout === "names" || readout === "staff" || readout === "both" || readout === "off")
			this.noteReadout = readout;
		this.showNumerals = read("numerals") === "1";
		this.highlightKey = read("highlight") !== "0";
		piano.load();
	}

	/** The key center's drawn index: the top, or the bottom of the circle (the arch puts the key at index 0 either way and turns itself over instead). */
	get keyIndex(): number {
		return this.keyAtTop || this.layout === "arch" ? 0 : 6;
	}
	/** The circle's layout for the drawing: the arch turns over, a bowl with the key at the bottom, when the key is not at the top. */
	get drawnLayout(): "circle" | "arch" | "arch-down" {
		if (this.layout !== "arch") return "circle";
		return this.keyAtTop ? "arch" : "arch-down";
	}
	/** The positions as drawn: the key center's at the top (or the bottom), the rest clockwise in fifths. */
	get positions(): CirclePosition[] {
		const offset = (this.keyCenter + this.keyIndex) % 12;
		return CIRCLE_OF_FIFTHS.map((_, i) => CIRCLE_OF_FIFTHS[(i + offset) % 12]);
	}
	/** The notes of notes mode, chromatic clockwise from the key center's root. */
	get notes(): { pitch: number; label: string }[] {
		const root = CIRCLE_OF_FIFTHS[this.keyCenter].major.pitch;
		const from = (root + this.keyIndex) % 12;
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
			// The wedge's degree in fifths from the key; a minor's is its own root's (vi under I).
			const offset = (drawnIndex - this.keyIndex + 12) % 12;
			const fifths = quality === "minor" ? (offset + 3) % 12 : offset;
			const recipe = this.recipe(fifths, quality, seventh || this.seventhHeld);
			notes = voiceChord({
				pitch: chord.pitch,
				intervals: recipe.intervals,
				voicing: this.voicing,
				octave: this.octave,
			});
			name = styledChordName(chord.label, quality, recipe);
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
	/** The custom style in use, if the style names one the account has. */
	get customStyle(): ChordStyleData | null {
		if (!this.style.startsWith("custom:")) return null;
		const id = this.style.slice(7);
		return this.customStyles.find((s) => s.id === id)?.data ?? null;
	}
	/** The built-in style in use (plain when a custom style is named but missing). */
	get builtinStyle(): ChordStyleId {
		return CHORD_STYLES.some((s) => s.id === this.style) ? (this.style as ChordStyleId) : "plain";
	}
	/** The style's name for the screen; null for plain. */
	get styleLabel(): string | null {
		const custom = this.style.startsWith("custom:")
			? this.customStyles.find((s) => s.id === this.style.slice(7))
			: null;
		if (custom) return custom.name;
		const builtin = CHORD_STYLES.find((s) => s.id === this.builtinStyle);
		return builtin && builtin.id !== "plain" ? builtin.label.toLowerCase() : null;
	}
	/** What each drawn wedge would play now, named: the style's chord on that degree, the 7 pad folded in (the circle's labels, Kevin). */
	get wedgeLabels(): { major: string; minor: string }[] {
		return this.positions.map((p, i) => {
			const offset = (i - this.keyIndex + 12) % 12;
			return {
				major: styledChordName(
					p.major.label,
					"major",
					this.recipe(offset, "major", this.seventhHeld),
				),
				minor: styledChordName(
					p.minor.label,
					"minor",
					this.recipe((offset + 3) % 12, "minor", this.seventhHeld),
				),
			};
		});
	}
	/** The recipe a wedge carries: from the custom style's rings, else the built-in's rule. */
	recipe(fifths: number, quality: ChordQuality, held: boolean): ChordRecipe {
		const custom = this.customStyle;
		if (custom && quality !== "diminished") {
			const degree = custom[quality][fifths];
			return CHORD_RECIPES[held ? degree.held : degree.plain];
		}
		return styledChord(this.builtinStyle, fifths, quality, held, this.seventhType);
	}
	/** Whether a style id names a built-in or one of the account's custom styles. */
	styleKnown(style: string): boolean {
		if (CHORD_STYLES.some((s) => s.id === style)) return true;
		return style.startsWith("custom:") && this.customStyles.some((s) => s.id === style.slice(7));
	}
	setStyle(style: string) {
		this.style = style;
		write("style", style);
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
	/** The active keyboard map: a key code to a drawn-index offset from the key and a quality. */
	get keyCodes(): Record<string, { position: number; quality: "major" | "minor" }> {
		return this.keyMap === "degree" ? DEGREE_KEY_CODES : CHORD_KEY_CODES;
	}
	/** The key labels by distance from the key clockwise, for the circle. */
	get keyLabels(): { major: string; minor: string }[] {
		return this.keyMap === "degree" ? DEGREE_KEY_LABELS : CHORD_KEY_LABELS;
	}
	/** The settings a chord player preset carries beside the piano's sound (docs/chord-player.md, "Presets"). */
	get presetSettings(): ChordPresetSettings {
		return {
			mode: this.mode,
			style: this.style,
			voicing: this.voicing,
			octave: this.octave,
			strum: this.strum,
		};
	}
	/** A preset's chord settings into the player; a style the account no longer has falls back to plain. */
	applyPresetSettings(s: ChordPresetSettings) {
		this.setMode(s.mode);
		this.setStyle(this.styleKnown(s.style) ? s.style : "plain");
		this.setVoicing(s.voicing);
		this.setOctave(s.octave);
		this.setStrum(s.strum);
	}
	setNoteReadout(mode: NoteReadout) {
		this.noteReadout = mode;
		write("note-readout", mode);
	}
	/**
	 * The sounding notes spelled for the readout, ascending: in flats on the
	 * flat side of the circle (positions 6 to 11, and C's own, so a C7 reads
	 * B♭), in sharps on the sharp side (1 to 5); notes mode by the key.
	 */
	get soundingSpelled(): SpelledNote[] {
		if (this.sounding.length === 0) return [];
		const first = this.sounding[0].wedge;
		let index = this.keyCenter;
		if (!first.startsWith("note:"))
			index = CIRCLE_OF_FIFTHS.findIndex((p) => p.major.id === first || p.minor.id === first);
		const flats = index === 0 || index >= 6;
		return spellChord(
			this.sounding.flatMap((s) => s.notes),
			flats,
		);
	}
	setKeyMap(map: ChordKeyMap) {
		this.keyMap = map;
		write("key-map", map);
	}
	setLayout(layout: "circle" | "arch") {
		this.layout = layout;
		write("layout", layout);
	}
	setShowNumerals(on: boolean) {
		this.showNumerals = on;
		write("numerals", on ? "1" : "0");
	}
	setHighlightKey(on: boolean) {
		this.highlightKey = on;
		write("highlight", on ? "1" : "0");
	}
}

export const chordPlayer = new ChordPlayerEngine();
