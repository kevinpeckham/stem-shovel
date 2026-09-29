/**
 * Which notes are sounding and which the sustain pedal is holding
 * (docs/piano.md): the bookkeeping behind a keyboard instrument, apart
 * from the audio so it can be tested. A note that is let go while the
 * pedal is down keeps sounding until the pedal comes up; a note pressed
 * again while held simply keeps going.
 */
export class HeldNotes {
	/** Notes with a key (or a MIDI note) down. */
	readonly down = new Set<number>();
	/** Notes let go under the pedal, still sounding. */
	readonly held = new Set<number>();
	sustain = false;

	/** Press: true when a new voice should start (false when the note is already sounding). */
	on(note: number): boolean {
		const sounding = this.down.has(note) || this.held.has(note);
		this.down.add(note);
		this.held.delete(note);
		return !sounding;
	}
	/** Release: true when the voice should stop now; false when the pedal keeps it. */
	off(note: number): boolean {
		if (!this.down.delete(note)) return false;
		if (this.sustain) {
			this.held.add(note);
			return false;
		}
		return true;
	}
	/** The pedal: down holds what is let go from now on; up returns the notes to stop now. */
	setSustain(on: boolean): number[] {
		this.sustain = on;
		if (on) return [];
		const release = [...this.held];
		this.held.clear();
		return release;
	}
	/** Everything, for a panic button or a change of instrument. */
	clear(): number[] {
		const all = [...this.down, ...this.held];
		this.down.clear();
		this.held.clear();
		return all;
	}
	get sounding(): number[] {
		return [...new Set([...this.down, ...this.held])].sort((a, b) => a - b);
	}
}
