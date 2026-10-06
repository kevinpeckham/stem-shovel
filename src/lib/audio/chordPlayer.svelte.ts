import { startLookahead } from "$lib/audio/lookahead";
import { metronome } from "$lib/audio/metronome.svelte";
import { chordPiano } from "$lib/audio/piano.svelte";
import type { ChordShareUi } from "$lib/val/ChordShareSchema";
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
import { arpSwingDelay } from "$lib/utils/arpSwingDelay";
import { Arpeggiator, type ArpPattern, type ArpRate } from "./arpeggiator.svelte";
import type { TempoRatio } from "$lib/constants/tempo";
import {
	AUTO_STRUM_PATTERNS,
	AUTO_STRUM_SPEEDS,
	type AutoStrumPatternId,
	type AutoStrumSpeed,
} from "$lib/constants/autoStrum";
import { spellChord, type SpelledNote } from "$lib/utils/noteSpelling";

export type StrumDirection = "down" | "up" | "alternate";
export type ChordAccent = "none" | "top" | "bottom";

export { ARP_PATTERNS, ARP_RATES, type ArpPattern, type ArpRate } from "./arpeggiator.svelte";

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
	/** The speed the strum comes back at when switched on (the Strum split button). */
	#lastStrum: Exclude<Strum, "off"> = "medium";
	/** The strum's direction: low to high as a downstroke, high to low, or alternating press by press. */
	strumDirection = $state<StrumDirection>("down");
	#strumFlip = false;
	/** Which note of a chord is louder: none, the top (a melody), or the bottom (a bass). */
	accent = $state<ChordAccent>("none");
	/** The inversion a drag within a wedge set on a held chord, by holder (docs/chord-player.md, "Inversions"). */
	#inversions = new Map<string, number>();
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

	// ---- the arpeggiator (docs/chord-player.md, "The arpeggiator"): the shared Arpeggiator on the chord player's engine, chords replacing one another ----
	readonly arpeggiator = new Arpeggiator<SoundingChord>({
		voice: {
			noteOn: (midi, velocity) => chordPiano.noteOn(midi, velocity),
			noteOff: (midi) => chordPiano.noteOff(midi),
			allOff: () => chordPiano.allOff(),
			output: () => chordPiano.output(),
		},
		read,
		write,
		mode: "replace",
	});
	/** A held wedge plays its notes one at a time in time with the tempo. */
	get arp() {
		return this.arpeggiator.on;
	}
	get arpRate() {
		return this.arpeggiator.rate;
	}
	get arpPattern() {
		return this.arpeggiator.pattern;
	}
	get arpOctaves() {
		return this.arpeggiator.octaves;
	}
	get arpGate() {
		return this.arpeggiator.gate;
	}
	get arpLatch() {
		return this.arpeggiator.latch;
	}
	get arpAlign() {
		return this.arpeggiator.align;
	}
	get arpAlignBars() {
		return this.arpeggiator.alignBars;
	}
	get arpOnBeat() {
		return this.arpeggiator.onBeat;
	}
	/** The arpeggiator's (and the strum pattern's) tempo as a ratio of the session's. */
	get tempoRatio() {
		return this.arpeggiator.tempoRatio;
	}
	/** The note the pattern is on, for the readout to light; null when it is not running. */
	get arpNote() {
		return this.arpeggiator.note;
	}
	/** One swing for the chord player (Kevin): the session's (metronome.swing), mirrored here for the device; the arpeggiator's odd steps and the strum pattern's odd slots land late. */
	swing = $state(0);
	/** The chord the arpeggiator or the strum pattern keeps playing after its wedge was let go (Latch), so the readout stays lit with it. */
	get latchedChord(): SoundingChord | null {
		return this.arpeggiator.latched ?? this.#strumLatched;
	}
	#strumLatched = $state<SoundingChord | null>(null);

	// ---- the strum pattern (docs/chord-player.md, "Strum") ----
	/** With the strum on, a press strums the chord and holding the wedge strums again and again in this pattern at the session tempo (Kevin: strum mode); "once" strums on the press alone. The arpeggiator wins when both are on. */
	strumPattern = $state<AutoStrumPatternId>("folk");
	strumSpeed = $state<AutoStrumSpeed>("8");
	/** The pattern keeps going after the wedge is let go, until the next chord or Escape (a double click on the Strum button). */
	strumLatch = $state(false);
	/** The sustain pedal locked down (a double tap on the pad or the space bar); a preset keeps it (Kevin). */
	sustainLock = $state(false);
	setSustainLock(on: boolean) {
		if (this.sustainLock === on) return;
		this.sustainLock = on;
		chordPiano.setSustain(on);
	}
	#autoHeld: Map<string, { notes: number[]; velocity: number }> = new Map();
	#autoLatched: { notes: number[]; velocity: number } | null = null;
	#autoStopLoop: (() => void) | null = null;
	#autoCtx: AudioContext | null = null;
	#autoOrigin = 0;
	#autoIndex = 0;
	#autoTimers: ReturnType<typeof setTimeout>[] = [];

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
		const last = read("strum-last");
		if (last === "slow" || last === "medium" || last === "fast") this.#lastStrum = last;
		const direction = read("strum-direction");
		if (direction === "down" || direction === "up" || direction === "alternate")
			this.strumDirection = direction;
		const accent = read("accent");
		if (accent === "none" || accent === "top" || accent === "bottom") this.accent = accent;
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
		this.arpeggiator.load();
		const strumPattern = read("auto-strum-pattern");
		if (strumPattern && AUTO_STRUM_PATTERNS.some((p) => p.id === strumPattern))
			this.strumPattern = strumPattern as AutoStrumPatternId;
		if (read("auto-strum-speed") === "16") this.strumSpeed = "16";
		this.strumLatch = read("auto-strum-latch") === "1";
		// The swing is the session's (docs/audio-engine.md, "One tempo for the page"): the drums and the chord player share it on a page.
		metronome.load();
		this.swing = metronome.swing;
		metronome.listen(() => (this.swing = metronome.swing));
		const readout = read("note-readout");
		if (readout === "names" || readout === "staff" || readout === "both" || readout === "off")
			this.noteReadout = readout;
		this.showNumerals = read("numerals") === "1";
		this.highlightKey = read("highlight") !== "0";
		chordPiano.load();
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
	press(drawnIndex: number, quality: ChordQuality, by: string, seventh = false, inversion = 0) {
		this.release(by);
		chordPiano.warm();
		let notes: number[];
		let name: string;
		let wedge: string;
		if (this.mode === "notes") {
			const note = this.notes[drawnIndex];
			notes = [noteMidi(note.pitch, this.octave)];
			name = `${note.label}${this.octave}`;
			wedge = `note:${drawnIndex}`;
		} else {
			({ wedge, notes, label: name } = this.chordAt(drawnIndex, quality, seventh, inversion));
		}
		if (inversion > 0) this.#inversions.set(by, inversion);
		else this.#inversions.delete(by);
		// More notes, each a little softer, so a rich voicing sums to about a triad's level (the limiter after the effects catches the rest).
		const velocity = this.velocity * Math.min(1, Math.sqrt(3 / notes.length));
		if (this.arp) {
			this.arpeggiator.hold(by, notes, velocity, { by, wedge, name, notes });
		} else if (this.strum !== "off") {
			this.#autoHold(by, notes, velocity);
		} else {
			this.#strike(by, notes, velocity);
		}
		this.sounding = [...this.sounding, { by, wedge, name, notes }];
		this.listener?.down(by, { label: name, wedge, notes });
	}
	/** What a wedge would play: its id, its name in the style (with the bass note after a slash when turned over) and its notes. */
	chordAt(
		drawnIndex: number,
		quality: ChordQuality,
		seventh = false,
		inversion = 0,
	): { wedge: string; label: string; notes: number[] } {
		const position = this.positions[drawnIndex];
		const chord = position[quality];
		// The wedge's degree in fifths from the key; a minor's is its own root's (vi under I).
		const offset = (drawnIndex - this.keyIndex + 12) % 12;
		const fifths = quality === "minor" ? (offset + 3) % 12 : offset;
		const recipe = this.recipe(fifths, quality, seventh || this.seventhHeld);
		const notes = voiceChord({
			pitch: chord.pitch,
			intervals: recipe.intervals,
			voicing: this.voicing,
			octave: this.octave,
			inversion,
		});
		let label = styledChordName(chord.label, quality, recipe);
		if (inversion > 0) label += `/${CHROMATIC_NOTES[notes[0] % 12]}`;
		return { wedge: chord.id, label, notes };
	}
	/** The drawn index of a degree (fifths from the key) for a ring: a minor's wedge sits three fifths back from its root. */
	drawnIndexOf(fifths: number, quality: ChordQuality): number {
		const offset = quality === "minor" ? (fifths + 9) % 12 : fifths;
		return (this.keyIndex + offset) % 12;
	}
	/** The notes down together, or strummed in the direction set (alternating turns each press), the accented note a touch louder and the rest a touch softer. */
	#strike(by: string, notes: number[], velocity: number) {
		const gap = STRUMS.find((s) => s.id === this.strum)?.ms ?? 0;
		let up = false;
		if (gap > 0) {
			up = this.strumDirection === "up" || (this.strumDirection === "alternate" && this.#strumFlip);
			if (this.strumDirection === "alternate") this.#strumFlip = !this.#strumFlip;
		}
		this.#timers.set(by, this.#strum(notes, velocity, up, gap));
	}
	/** The notes down together (no gap), or one after another `gap` ms apart, low to high or the other way up; the accented note a touch louder and the rest a touch softer. */
	#strum(notes: number[], velocity: number, up: boolean, gap: number) {
		const order = up ? [...notes].reverse() : [...notes];
		const top = Math.max(...notes);
		const bottom = Math.min(...notes);
		const level = (midi: number) => {
			if (this.accent === "top")
				return midi === top ? Math.min(1, velocity * 1.25) : velocity * 0.8;
			if (this.accent === "bottom")
				return midi === bottom ? Math.min(1, velocity * 1.25) : velocity * 0.8;
			return velocity;
		};
		const timers: ReturnType<typeof setTimeout>[] = [];
		order.forEach((midi, i) => {
			if (gap === 0 || i === 0) chordPiano.noteOn(midi, level(midi));
			else timers.push(setTimeout(() => chordPiano.noteOn(midi, level(midi)), gap * i));
		});
		return timers;
	}

	/** A chord into the auto-strum: the pattern starts again from its first slot on the press (so the chord sounds at once), the loop on the piano's clock. */
	#autoHold(by: string, notes: number[], velocity: number) {
		const ctx = chordPiano.output().context as AudioContext;
		this.#autoCtx = ctx;
		this.#autoHeld.set(by, { notes, velocity });
		this.#autoLatched = null;
		this.#strumLatched = null;
		for (const t of this.#autoTimers) clearTimeout(t);
		this.#autoTimers = [];
		this.#autoOrigin = ctx.currentTime + 0.01;
		this.#autoIndex = 0;
		if (!this.#autoStopLoop) this.#autoStopLoop = startLookahead(ctx, this.#autoSchedule);
	}
	/** A chord let go: its notes stop (the pedal may hold them); the last one latches or ends the pattern. */
	#autoRelease(by: string, chord: SoundingChord) {
		const held = this.#autoHeld.get(by);
		this.#autoHeld.delete(by);
		const stillHeld = new Set([...this.#autoHeld.values()].flatMap((h) => h.notes));
		for (const midi of chord.notes) if (!stillHeld.has(midi)) chordPiano.noteOff(midi);
		if (this.#autoHeld.size === 0) {
			if (this.strumLatch && held && this.strumPattern !== "once") {
				this.#autoLatched = held;
				this.#strumLatched = chord;
			} else this.#autoStop();
		}
	}
	#autoStop() {
		this.#autoStopLoop?.();
		this.#autoStopLoop = null;
		for (const t of this.#autoTimers) clearTimeout(t);
		this.#autoTimers = [];
		if (this.#autoLatched) for (const midi of this.#autoLatched.notes) chordPiano.noteOff(midi);
		this.#autoHeld.clear();
		this.#autoLatched = null;
		this.#strumLatched = null;
	}
	#autoSchedule = (until: number) => {
		const perBeat = AUTO_STRUM_SPEEDS.find((s) => s.id === this.strumSpeed)?.perBeat ?? 2;
		const step = 60 / (metronome.bpm * this.tempoRatio) / perBeat;
		const pattern = AUTO_STRUM_PATTERNS.find((p) => p.id === this.strumPattern);
		const slots = pattern?.slots ?? "D-D-D-D-";
		const once = pattern?.id === "once";
		const gap = STRUMS.find((s) => s.id === this.strum)?.ms ?? 25;
		while (this.#autoOrigin + this.#autoIndex * step < until) {
			const n = this.#autoIndex;
			// Once: the press's strum alone; the chord then rings as a plain strum did.
			if (once && n > 0) return;
			const slot = slots[n % slots.length];
			const sources = this.#autoHeld.size
				? [...this.#autoHeld.values()]
				: this.#autoLatched
					? [this.#autoLatched]
					: [];
			if (sources.length === 0) {
				this.#autoStop();
				return;
			}
			if (slot === "D" || slot === "U") {
				// The direction setting: down plays the pattern as written, up turns every stroke over, alternate turns it over every other time through (Once: press by press).
				let flip = this.strumDirection === "up";
				if (this.strumDirection === "alternate") {
					if (once) {
						flip = this.#strumFlip;
						this.#strumFlip = !this.#strumFlip;
					} else flip = Math.floor(n / slots.length) % 2 === 1;
				}
				const up = (slot === "U") !== flip;
				const at = this.#autoOrigin + n * step + arpSwingDelay(n, step, this.swing, perBeat);
				const ctx = this.#autoCtx!;
				this.#autoTimers.push(
					setTimeout(
						() => {
							for (const s of sources) {
								for (const midi of s.notes) chordPiano.noteOff(midi);
								this.#autoTimers.push(...this.#strum(s.notes, s.velocity, up, gap));
							}
						},
						Math.max(0, (at - ctx.currentTime) * 1000),
					),
				);
				if (this.#autoTimers.length > 200) this.#autoTimers = this.#autoTimers.slice(-120);
			}
			this.#autoIndex = n + 1;
		}
	};
	setStrumPattern(pattern: AutoStrumPatternId) {
		this.strumPattern = pattern;
		write("auto-strum-pattern", pattern);
	}
	setStrumSpeed(speed: AutoStrumSpeed) {
		this.strumSpeed = speed;
		write("auto-strum-speed", speed);
	}
	setStrumLatch(on: boolean) {
		this.strumLatch = on;
		write("auto-strum-latch", on ? "1" : "0");
		if (!on && this.#autoHeld.size === 0) this.#autoStop();
	}
	/** A drag within a held wedge turns the chord (docs/chord-player.md, "Inversions"): the same wedge pressed again at the new inversion, no strum. */
	invert(drawnIndex: number, quality: ChordQuality, by: string, inversion: number) {
		if ((this.#inversions.get(by) ?? 0) === inversion) return;
		const strum = this.strum;
		this.strum = "off";
		this.press(drawnIndex, quality, by, false, inversion);
		this.strum = strum;
	}
	/** The chord held by `by` stops (its notes, unless another holder shares one). */
	release(by: string) {
		const held = this.sounding.find((s) => s.by === by);
		if (!held) return;
		for (const t of this.#timers.get(by) ?? []) clearTimeout(t);
		this.#timers.delete(by);
		const rest = this.sounding.filter((s) => s.by !== by);
		if (this.arpeggiator.holds(by)) {
			this.arpeggiator.release(by, held);
		} else if (this.#autoHeld.has(by)) {
			this.#autoRelease(by, held);
		} else {
			const stillHeld = new Set(rest.flatMap((s) => s.notes));
			for (const midi of held.notes) if (!stillHeld.has(midi)) chordPiano.noteOff(midi);
		}
		this.sounding = rest;
		this.listener?.up(by);
	}
	/** A jotted chord played back by the pad: its notes as they were, held until `release(by)`. */
	sound(by: string, chord: { label: string; wedge: string; notes: number[] }) {
		this.release(by);
		const velocity = this.velocity * Math.min(1, Math.sqrt(3 / chord.notes.length));
		if (this.arp)
			this.arpeggiator.hold(by, chord.notes, velocity, {
				by,
				wedge: chord.wedge,
				name: chord.label,
				notes: chord.notes,
			});
		else if (this.strum !== "off") this.#autoHold(by, chord.notes, velocity);
		else for (const midi of chord.notes) chordPiano.noteOn(midi, velocity);
		this.sounding = [
			...this.sounding,
			{ by, wedge: chord.wedge, name: chord.label, notes: chord.notes },
		];
	}

	setArp(on: boolean) {
		this.arpeggiator.setOn(on);
		if (!on) {
			// Whatever is held keeps sounding as a chord.
			const held = this.arpeggiator.heldNotes();
			this.arpeggiator.stop();
			for (const h of held) for (const midi of h.notes) chordPiano.noteOn(midi, h.velocity);
		} else if (this.sounding.length) {
			// Held chords switch over to the pattern (out of the strum pattern if they were in it).
			this.#autoHeld.clear();
			this.#autoStop();
			for (const s of this.sounding) for (const midi of s.notes) chordPiano.noteOff(midi);
			this.arpeggiator.restartWith(
				this.sounding.map((s) => ({ by: s.by, notes: s.notes, velocity: this.velocity })),
			);
		}
	}
	setArpRate(rate: ArpRate) {
		this.arpeggiator.setRate(rate);
	}
	setArpPattern(pattern: ArpPattern) {
		this.arpeggiator.setPattern(pattern);
	}
	setArpOctaves(n: number) {
		this.arpeggiator.setOctaves(n);
	}
	setArpGate(g: number) {
		this.arpeggiator.setGate(g);
	}
	setTempoRatio(ratio: TempoRatio) {
		this.arpeggiator.setTempoRatio(ratio);
	}
	setSwing(v: number) {
		this.swing = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
		metronome.setSwing(this.swing);
	}
	setArpOnBeat(on: boolean) {
		this.arpeggiator.setOnBeat(on);
	}
	setArpAlign(on: boolean) {
		this.arpeggiator.setAlign(on);
	}
	setArpAlignBars(bars: 1 | 2) {
		this.arpeggiator.setAlignBars(bars);
	}
	setArpLatch(on: boolean) {
		this.arpeggiator.setLatch(on);
	}
	/** Everything off: leaving the page, Escape, the window losing focus. */
	allOff() {
		for (const timers of this.#timers.values()) for (const t of timers) clearTimeout(t);
		this.#timers.clear();
		if (this.arpeggiator.active) this.arpeggiator.stop();
		if (this.#autoStopLoop || this.#autoLatched || this.#autoHeld.size) this.#autoStop();
		const held = this.sounding.map((s) => s.by);
		this.sounding = [];
		chordPiano.allOff();
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
		const was = this.strum;
		this.strum = strum;
		write("strum", strum);
		if (strum !== "off") {
			this.#lastStrum = strum;
			write("strum-last", strum);
		}
		if (strum === "off" && was !== "off") {
			// What is held keeps sounding as it is; a latched pattern stops.
			this.#autoHeld.clear();
			this.#autoStop();
		} else if (strum !== "off" && was === "off" && !this.arp) {
			// Held chords join the pattern.
			for (const s of this.sounding)
				this.#autoHold(s.by, s.notes, this.velocity * Math.min(1, Math.sqrt(3 / s.notes.length)));
		}
	}
	/** The strum on at its last speed, or off. */
	toggleStrum() {
		this.setStrum(this.strum === "off" ? this.#lastStrum : "off");
	}
	setStrumDirection(direction: StrumDirection) {
		this.strumDirection = direction;
		write("strum-direction", direction);
	}
	setAccent(accent: ChordAccent) {
		this.accent = accent;
		write("accent", accent);
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
	/** Something plays on its own: a latched arpeggio or strum pattern (the device's Stop button, docs/chord-player.md, "Stop"). */
	get autoPlaying(): boolean {
		return this.latchedChord !== null;
	}
	/** The circle's look and key, as a share link carries them (docs/chord-player.md, "Share links"). */
	get uiSettings(): ChordShareUi {
		return {
			keyCenter: this.keyCenter,
			keyAtTop: this.keyAtTop,
			layout: this.layout,
			keyMap: this.keyMap,
			showKeys: this.showKeys,
			showSignatures: this.showSignatures,
			showNumerals: this.showNumerals,
			highlightKey: this.highlightKey,
			noteReadout: this.noteReadout,
		};
	}
	applyUiSettings(ui: ChordShareUi) {
		this.setKeyCenter(ui.keyCenter);
		this.setKeyAtTop(ui.keyAtTop);
		this.setLayout(ui.layout);
		this.setKeyMap(ui.keyMap);
		this.setShowKeys(ui.showKeys);
		this.setShowSignatures(ui.showSignatures);
		this.setShowNumerals(ui.showNumerals);
		this.setHighlightKey(ui.highlightKey);
		this.setNoteReadout(ui.noteReadout);
	}
	/** The settings a chord player preset carries beside the piano's sound (docs/chord-player.md, "Presets"). */
	get presetSettings(): ChordPresetSettings {
		return {
			mode: this.mode,
			style: this.style,
			voicing: this.voicing,
			octave: this.octave,
			strum: this.strum,
			strumDirection: this.strumDirection,
			accent: this.accent,
			seventhType: this.seventhType,
			velocity: this.velocity,
			autoStrum: {
				pattern: this.strumPattern,
				speed: this.strumSpeed,
				latch: this.strumLatch,
				swing: this.swing,
			},
			arp: this.arpeggiator.settings(),
			sustainLock: this.sustainLock,
		};
	}
	/** A preset's chord settings into the player; a style the account no longer has falls back to plain. */
	applyPresetSettings(s: ChordPresetSettings) {
		this.setMode(s.mode);
		this.setStyle(this.styleKnown(s.style) ? s.style : "plain");
		this.setVoicing(s.voicing);
		this.setOctave(s.octave);
		this.setStrum(s.strum);
		if (s.strumDirection) this.setStrumDirection(s.strumDirection);
		if (s.accent) this.setAccent(s.accent);
		if (s.seventhType) this.setSeventhType(s.seventhType);
		if (s.velocity !== undefined) this.setVelocity(s.velocity);
		if (s.autoStrum) {
			this.setStrumPattern(s.autoStrum.pattern);
			this.setStrumSpeed(s.autoStrum.speed);
			this.setStrumLatch(s.autoStrum.latch);
			if (s.autoStrum.swing !== undefined) this.setSwing(s.autoStrum.swing);
		}
		if (s.arp) {
			this.arpeggiator.apply(s.arp);
			if (s.arp.on !== this.arp) this.setArp(s.arp.on);
		}
		if (s.sustainLock !== undefined) this.setSustainLock(s.sustainLock);
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
		const sounding = this.sounding.length
			? this.sounding
			: this.latchedChord
				? [this.latchedChord]
				: [];
		if (sounding.length === 0) return [];
		const first = sounding[0].wedge;
		let index = this.keyCenter;
		if (!first.startsWith("note:"))
			index = CIRCLE_OF_FIFTHS.findIndex((p) => p.major.id === first || p.minor.id === first);
		const flats = index === 0 || index >= 6;
		return spellChord(
			sounding.flatMap((s) => s.notes),
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
