import { startLookahead } from "$lib/audio/lookahead";
import { metronome } from "$lib/audio/metronome.svelte";
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
import { arpStepIndex } from "$lib/utils/arpStep";
import { arpSwingDelay } from "$lib/utils/arpSwingDelay";
import { tempoRatioOf, type TempoRatio } from "$lib/constants/tempo";
import { arpChangeSteps, arpSwitchStep } from "$lib/utils/arpSwitch";
import { spellChord, type SpelledNote } from "$lib/utils/noteSpelling";

export type StrumDirection = "down" | "up" | "alternate";
export type ChordAccent = "none" | "top" | "bottom";

/** The arpeggiator's step: notes per beat at the metronome's tempo. */
export const ARP_RATES = [
	{ id: "4", label: "Quarter notes", perBeat: 1 },
	{ id: "8", label: "Eighth notes", perBeat: 2 },
	{ id: "8t", label: "Eighth-note triplets", perBeat: 3 },
	{ id: "16", label: "Sixteenth notes", perBeat: 4 },
] as const;
export type ArpRate = (typeof ARP_RATES)[number]["id"];
export const ARP_PATTERNS = [
	{ id: "up", label: "Up" },
	{ id: "down", label: "Down" },
	{ id: "updown", label: "Up and down" },
	{ id: "played", label: "As played" },
	{ id: "random", label: "Random" },
] as const;
export type ArpPattern = (typeof ARP_PATTERNS)[number]["id"];

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

	// ---- the arpeggiator (docs/chord-player.md, "The arpeggiator") ----
	/** A held wedge plays its notes one at a time in time with the tempo. */
	arp = $state(false);
	arpRate = $state<ArpRate>("8");
	arpPattern = $state<ArpPattern>("up");
	arpOctaves = $state(1);
	/** How much of each step the note sounds, 0.1 (staccato) to 1 (legato). */
	arpGate = $state(0.6);
	/** The pattern keeps running after the wedge is let go, until the next chord or Escape. */
	arpLatch = $state(false);
	/** The pattern restarts at every bar (or two), dropping what was left, so it lands the same way each bar whatever the chord's note count (Kevin); on by default. */
	arpAlign = $state(true);
	arpAlignBars = $state<1 | 2>(1);
	/** The arpeggiator's tempo as a ratio of the session's (docs/audio-engine.md, "One tempo for the page"): half-time, with it, double-time. */
	tempoRatio = $state<TempoRatio>(1);
	/** Swing, 0 (straight) to 1 (a triplet feel): the odd steps land late, in eighths and sixteenths. */
	arpSwing = $state(0);
	/** The note the pattern is on, for the readout to light; null when it is not running. */
	arpNote = $state<number | null>(null);
	/** The chord the pattern keeps playing after its wedge was let go (Latch), so the readout stays lit with it. */
	arpLatchedChord = $state<SoundingChord | null>(null);
	#arpHeld: Map<string, { notes: number[]; velocity: number }> = new Map();
	#arpLatched: { notes: number[]; velocity: number } | null = null;
	#arpStopLoop: (() => void) | null = null;
	/** The steps queued ahead (within the lookahead), each with its timers, so a chord change can take them back. */
	#arpQueued: { step: number; timers: ReturnType<typeof setTimeout>[] }[] = [];
	/** The grid: step 0's time on the context's clock, and the next step to queue; times come from these, so the grid never drifts. */
	#arpOrigin = 0;
	#arpIndex = 0;
	/** A chord pressed while the pattern runs, to take over at `step` (docs/chord-player.md: changes land on the beat). */
	#arpPending: {
		held: Map<string, { notes: number[]; velocity: number }>;
		step: number;
		base: number;
	} | null = null;
	/** The step the running pattern counts from: the grid's origin, or the change point the current chord joined at. */
	#arpBase = 0;
	/** Chord changes join the running grid at the next change point (on by default); off, a new chord restarts the pattern as it is pressed. */
	arpOnBeat = $state(true);
	#arpCtx: AudioContext | null = null;
	/** When the pattern last stopped and its step length then, so a press soon after joins the same grid. */
	#arpStoppedAt = -Infinity;
	#arpStoppedStep = 0;

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
		this.arp = read("arp") === "1";
		const rate = read("arp-rate");
		if (rate && ARP_RATES.some((r) => r.id === rate)) this.arpRate = rate as ArpRate;
		const pattern = read("arp-pattern");
		if (pattern && ARP_PATTERNS.some((r) => r.id === pattern))
			this.arpPattern = pattern as ArpPattern;
		const octaves = Number(read("arp-octaves"));
		if (Number.isInteger(octaves) && octaves >= 1 && octaves <= 3) this.arpOctaves = octaves;
		const gate = Number(read("arp-gate"));
		if (Number.isFinite(gate) && gate >= 0.1 && gate <= 1) this.arpGate = gate;
		this.arpLatch = read("arp-latch") === "1";
		this.arpAlign = read("arp-align") !== "0";
		this.arpOnBeat = read("arp-on-beat") !== "0";
		if (read("arp-align-bars") === "2") this.arpAlignBars = 2;
		this.tempoRatio = tempoRatioOf(Number(read("tempo-ratio"))) ?? 1;
		const swing = Number(read("arp-swing"));
		if (Number.isFinite(swing) && swing >= 0 && swing <= 1) this.arpSwing = swing;
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
	press(drawnIndex: number, quality: ChordQuality, by: string, seventh = false, inversion = 0) {
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
			({ wedge, notes, label: name } = this.chordAt(drawnIndex, quality, seventh, inversion));
		}
		if (inversion > 0) this.#inversions.set(by, inversion);
		else this.#inversions.delete(by);
		// More notes, each a little softer, so a rich voicing sums to about a triad's level (the limiter after the effects catches the rest).
		const velocity = this.velocity * Math.min(1, Math.sqrt(3 / notes.length));
		if (this.arp) {
			this.#arpHold(by, notes, velocity);
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
		let order = [...notes];
		if (gap > 0) {
			const up =
				this.strumDirection === "up" || (this.strumDirection === "alternate" && this.#strumFlip);
			if (this.strumDirection === "alternate") this.#strumFlip = !this.#strumFlip;
			if (up) order = order.reverse();
		}
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
			if (gap === 0 || i === 0) piano.noteOn(midi, level(midi));
			else timers.push(setTimeout(() => piano.noteOn(midi, level(midi)), gap * i));
		});
		this.#timers.set(by, timers);
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
		if (this.#arpHeld.has(by)) {
			this.#arpRelease(by, held);
		} else {
			const stillHeld = new Set(rest.flatMap((s) => s.notes));
			for (const midi of held.notes) if (!stillHeld.has(midi)) piano.noteOff(midi);
		}
		this.sounding = rest;
		this.listener?.up(by);
	}
	/** A jotted chord played back by the pad: its notes as they were, held until `release(by)`. */
	sound(by: string, chord: { label: string; wedge: string; notes: number[] }) {
		this.release(by);
		const velocity = this.velocity * Math.min(1, Math.sqrt(3 / chord.notes.length));
		if (this.arp) this.#arpHold(by, chord.notes, velocity);
		else for (const midi of chord.notes) piano.noteOn(midi, velocity);
		this.sounding = [
			...this.sounding,
			{ by, wedge: chord.wedge, name: chord.label, notes: chord.notes },
		];
	}

	/**
	 * A chord into the arpeggiator. The first starts the grid on the press.
	 * While the pattern runs, with changes on the beat, a new chord joins the
	 * grid at the next change point (or the next step when the press was just
	 * late for one), the old chord playing until then; otherwise the pattern
	 * restarts on the press.
	 */
	#arpHold(by: string, notes: number[], velocity: number) {
		const running = !!this.#arpStopLoop && !!this.#arpCtx;
		const stepSec = this.#arpStepSeconds();
		// A grid that stopped within the last bar at this step length is still the grid (a chord let go, the next pressed a moment later, latch or not): the new chord joins it at its change point.
		const rejoin =
			!running &&
			this.arpOnBeat &&
			!!this.#arpCtx &&
			this.#arpStoppedStep === stepSec &&
			this.#arpCtx.currentTime - this.#arpStoppedAt < stepSec * arpChangeSteps(this.arpRate) * 4;
		if ((running || rejoin) && this.arpOnBeat) {
			const ctx = this.#arpCtx!;
			const at = (ctx.currentTime - this.#arpOrigin) / stepSec;
			const changeSteps = arpChangeSteps(this.arpRate);
			const switchStep = arpSwitchStep(at, changeSteps, 0.5);
			// The pattern counts from the change point: a chord that waited starts on its first note; one that was just late lands in its place.
			const base = Math.floor(switchStep / changeSteps) * changeSteps;
			this.#arpPending = { held: new Map([[by, { notes, velocity }]]), step: switchStep, base };
			if (rejoin) {
				this.#arpIndex = switchStep;
				this.#arpStopLoop = startLookahead(ctx, this.#arpSchedule);
				return;
			}
			// Steps already queued from the change point on come back, to be queued again with the new chord.
			const keep = this.#arpQueued.filter((q) => q.step < switchStep);
			for (const q of this.#arpQueued)
				if (q.step >= switchStep) for (const t of q.timers) clearTimeout(t);
			this.#arpQueued = keep;
			if (this.#arpIndex > switchStep) this.#arpIndex = switchStep;
			return;
		}
		this.#arpHeld.set(by, { notes, velocity });
		this.#arpLatched = null;
		this.arpLatchedChord = null;
		this.#arpPending = null;
		this.#arpIndex = 0;
		this.#arpRestart();
	}
	#arpRelease(by: string, chord?: SoundingChord) {
		// A chord let go before it took over: the change is off, the old chord runs on.
		if (this.#arpPending?.held.has(by)) {
			this.#arpPending = null;
			if (this.#arpHeld.size === 0 && !this.#arpLatched) this.#arpStop();
			return;
		}
		const held = this.#arpHeld.get(by);
		this.#arpHeld.delete(by);
		if (this.#arpHeld.size === 0) {
			if (this.arpLatch && held) {
				this.#arpLatched = held;
				this.arpLatchedChord = chord ?? null;
			} else if (this.#arpPending) {
				// Let go with the next chord already pressed (legato): the old one runs on until the new one takes over at its step.
				this.#arpLatched = held ?? null;
				this.arpLatchedChord = chord ?? null;
			} else this.#arpStop();
		}
	}
	/** The notes to cycle: every held chord's (or the latched one's), ascending, through the octaves, in the pattern's order. */
	#arpSequence(): { midi: number; velocity: number }[] {
		const sources = this.#arpHeld.size
			? [...this.#arpHeld.values()]
			: this.#arpLatched
				? [this.#arpLatched]
				: [];
		const seen = new Set<number>();
		const played: { midi: number; velocity: number }[] = [];
		for (const s of sources)
			for (const midi of [...s.notes].sort((a, b) => a - b))
				for (let o = 0; o < this.arpOctaves; o++) {
					const m = midi + 12 * o;
					if (m > 127 || seen.has(m)) continue;
					seen.add(m);
					played.push({ midi: m, velocity: s.velocity });
				}
		const up = [...played].sort((a, b) => a.midi - b.midi);
		switch (this.arpPattern) {
			case "down":
				return up.reverse();
			case "updown":
				return up.length > 2 ? [...up, ...up.slice(1, -1).reverse()] : up;
			case "played":
				return played;
			default:
				return up;
		}
	}
	#arpStepSeconds(): number {
		const beat = 60 / (metronome.bpm * this.tempoRatio);
		return beat / (ARP_RATES.find((r) => r.id === this.arpRate)?.perBeat ?? 2);
	}
	#arpRestart() {
		const ctx = piano.output().context as AudioContext;
		this.#arpCtx = ctx;
		this.#arpClearQueue();
		piano.allOff();
		this.#arpOrigin = ctx.currentTime + 0.01;
		this.#arpIndex = 0;
		this.#arpBase = 0;
		if (!this.#arpStopLoop) this.#arpStopLoop = startLookahead(ctx, this.#arpSchedule);
	}
	#arpClearQueue() {
		for (const q of this.#arpQueued) for (const t of q.timers) clearTimeout(t);
		this.#arpQueued = [];
	}
	#arpStop() {
		this.#arpStopLoop?.();
		this.#arpStopLoop = null;
		if (this.#arpCtx) {
			this.#arpStoppedAt = this.#arpCtx.currentTime;
			this.#arpStoppedStep = this.#arpStepSeconds();
		}
		this.#arpClearQueue();
		this.#arpHeld.clear();
		this.#arpLatched = null;
		this.arpLatchedChord = null;
		this.arpNote = null;
		this.#arpPending = null;
		piano.allOff();
	}
	#arpAt(time: number, fn: () => void): ReturnType<typeof setTimeout> {
		const ctx = this.#arpCtx!;
		return setTimeout(fn, Math.max(0, (time - ctx.currentTime) * 1000));
	}
	#arpSchedule = (until: number) => {
		const step = this.#arpStepSeconds();
		const perBeat = ARP_RATES.find((r) => r.id === this.arpRate)?.perBeat ?? 2;
		const stepsPerCycle = this.arpAlign
			? metronome.beatsPerBar * perBeat * this.arpAlignBars
			: null;
		let seq = this.#arpSequence();
		while (this.#arpOrigin + this.#arpIndex * step < until) {
			// A pending chord takes over from its step on.
			if (this.#arpPending && this.#arpIndex >= this.#arpPending.step) {
				this.#arpHeld = this.#arpPending.held;
				this.#arpLatched = null;
				this.arpLatchedChord = null;
				this.#arpBase = this.#arpPending.base;
				this.#arpPending = null;
				seq = this.#arpSequence();
			}
			if (seq.length === 0) {
				if (!this.#arpPending) this.#arpStop();
				return;
			}
			const n = this.#arpIndex;
			// The pattern's position: from the chord's change point, restarted at every bar line when lined up.
			const barLine = stepsPerCycle ? Math.floor(n / stepsPerCycle) * stepsPerCycle : 0;
			const i =
				this.arpPattern === "random"
					? Math.floor(Math.random() * seq.length)
					: arpStepIndex(n - Math.max(this.#arpBase, barLine), seq.length, null);
			const { midi, velocity } = seq[i];
			const at = this.#arpOrigin + n * step + arpSwingDelay(n, step, this.arpSwing, perBeat);
			this.#arpQueued.push({
				step: n,
				timers: [
					this.#arpAt(at, () => {
						piano.noteOn(midi, velocity);
						this.arpNote = midi;
					}),
					this.#arpAt(at + Math.max(0.03, step * this.arpGate), () => piano.noteOff(midi)),
				],
			});
			if (this.#arpQueued.length > 64) this.#arpQueued = this.#arpQueued.slice(-48);
			this.#arpIndex = n + 1;
		}
	};
	setArp(on: boolean) {
		this.arp = on;
		write("arp", on ? "1" : "0");
		if (!on) {
			// Whatever is held keeps sounding as a chord.
			const held = [...this.#arpHeld.values()];
			this.#arpStop();
			for (const h of held) for (const midi of h.notes) piano.noteOn(midi, h.velocity);
		} else if (this.sounding.length) {
			// Held chords switch over to the pattern.
			for (const s of this.sounding) {
				for (const midi of s.notes) piano.noteOff(midi);
				this.#arpHeld.set(s.by, { notes: s.notes, velocity: this.velocity });
			}
			this.#arpIndex = 0;
			this.#arpRestart();
		}
	}
	setArpRate(rate: ArpRate) {
		this.arpRate = rate;
		write("arp-rate", rate);
	}
	setArpPattern(pattern: ArpPattern) {
		this.arpPattern = pattern;
		write("arp-pattern", pattern);
	}
	setArpOctaves(n: number) {
		this.arpOctaves = Math.max(1, Math.min(3, Math.round(n)));
		write("arp-octaves", String(this.arpOctaves));
	}
	setArpGate(g: number) {
		this.arpGate = Math.max(0.1, Math.min(1, Math.round(g * 100) / 100));
		write("arp-gate", String(this.arpGate));
	}
	setTempoRatio(ratio: TempoRatio) {
		this.tempoRatio = ratio;
		write("tempo-ratio", String(ratio));
	}
	setArpSwing(v: number) {
		this.arpSwing = Math.max(0, Math.min(1, Math.round(v * 100) / 100));
		write("arp-swing", String(this.arpSwing));
	}
	setArpOnBeat(on: boolean) {
		this.arpOnBeat = on;
		write("arp-on-beat", on ? "1" : "0");
	}
	setArpAlign(on: boolean) {
		this.arpAlign = on;
		write("arp-align", on ? "1" : "0");
	}
	setArpAlignBars(bars: 1 | 2) {
		this.arpAlignBars = bars;
		write("arp-align-bars", String(bars));
	}
	setArpLatch(on: boolean) {
		this.arpLatch = on;
		write("arp-latch", on ? "1" : "0");
		if (!on && this.#arpHeld.size === 0) this.#arpStop();
	}
	/** Everything off: leaving the page, Escape, the window losing focus. */
	allOff() {
		for (const timers of this.#timers.values()) for (const t of timers) clearTimeout(t);
		this.#timers.clear();
		if (this.#arpStopLoop || this.#arpLatched || this.#arpHeld.size) this.#arpStop();
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
		if (strum !== "off") {
			this.#lastStrum = strum;
			write("strum-last", strum);
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
			arp: {
				on: this.arp,
				rate: this.arpRate,
				pattern: this.arpPattern,
				octaves: this.arpOctaves,
				gate: this.arpGate,
				latch: this.arpLatch,
				align: this.arpAlign,
				alignBars: this.arpAlignBars,
				onBeat: this.arpOnBeat,
				swing: this.arpSwing,
				ratio: this.tempoRatio,
			},
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
		if (s.arp) {
			this.setArpRate(s.arp.rate);
			this.setArpPattern(s.arp.pattern);
			this.setArpOctaves(s.arp.octaves);
			this.setArpGate(s.arp.gate);
			this.setArpLatch(s.arp.latch);
			if (s.arp.align !== undefined) this.setArpAlign(s.arp.align);
			if (s.arp.alignBars !== undefined) this.setArpAlignBars(s.arp.alignBars);
			if (s.arp.onBeat !== undefined) this.setArpOnBeat(s.arp.onBeat);
			if (s.arp.swing !== undefined) this.setArpSwing(s.arp.swing);
			if (s.arp.ratio !== undefined) this.setTempoRatio(s.arp.ratio);
			if (s.arp.on !== this.arp) this.setArp(s.arp.on);
		}
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
			: this.arpLatchedChord
				? [this.arpLatchedChord]
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
