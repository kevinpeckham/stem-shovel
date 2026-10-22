/**
 * A small Standard MIDI File reader: enough to draw a piano roll, and to
 * check what a conductor track says. Tracks are merged, tempo changes are
 * honored when converting ticks to seconds, and besides note on/off the
 * tempo, time signature, key signature, marker and track name meta events
 * are kept (in seconds); everything else is skipped.
 */
export interface MidiNote {
	/** Seconds from the start of the file. */
	start: number;
	duration: number;
	/** 0–127; 60 is middle C. */
	pitch: number;
	velocity: number;
	channel: number;
	/** The file's track the note came from, from 0 (the conductor of a format 1 file is 0). */
	track: number;
}

export interface MidiSummary {
	notes: MidiNote[];
	/** End of the last note, in seconds. */
	duration: number;
	lowest: number;
	highest: number;
	/** The conductor's events, in seconds, in file order. */
	tempos?: { at: number; bpm: number }[];
	meters?: { at: number; numerator: number; denominator: number }[];
	keys?: { at: number; sharps: number; minor: boolean }[];
	markers?: { at: number; name: string }[];
	/** Each track's name, where it has one. */
	trackNames?: string[];
	/** The name of each track by its index, undefined where it has none. */
	trackNameAt?: (string | undefined)[];
	/** How many tracks the file declares. */
	trackCount?: number;
	/** Channel events besides notes (controllers, pitch bend, program changes, pressure), skipped. */
	otherEvents?: number;
}

class Reader {
	pos = 0;
	constructor(private view: DataView) {}
	get length() {
		return this.view.byteLength;
	}
	get done() {
		return this.pos >= this.view.byteLength;
	}
	u8() {
		return this.view.getUint8(this.pos++);
	}
	u16() {
		const v = this.view.getUint16(this.pos);
		this.pos += 2;
		return v;
	}
	u32() {
		const v = this.view.getUint32(this.pos);
		this.pos += 4;
		return v;
	}
	ascii(n: number) {
		let s = "";
		for (let i = 0; i < n; i++) s += String.fromCharCode(this.u8());
		return s;
	}
	/** MIDI's variable-length quantity: 7 bits per byte, high bit = continue. */
	vlq() {
		let v = 0;
		for (let i = 0; i < 4; i++) {
			const b = this.u8();
			v = (v << 7) | (b & 0x7f);
			if ((b & 0x80) === 0) break;
		}
		return v;
	}
	skip(n: number) {
		this.pos += n;
	}
}

interface RawEvent {
	tick: number;
	kind: "on" | "off" | "tempo" | "meter" | "key" | "marker";
	channel: number;
	pitch: number;
	velocity: number;
	usPerQuarter: number;
	track: number;
	/** A meter's numerator and denominator power, or a key's sharps (signed) and minor flag. */
	a?: number;
	b?: number;
	text?: string;
}

const utf8 = new TextDecoder();

function readTrack(
	r: Reader,
	end: number,
	events: RawEvent[],
	names: string[],
	track: number,
	nameAt: (string | undefined)[],
): number {
	let tick = 0;
	let running = 0;
	let others = 0;
	while (r.pos < end) {
		tick += r.vlq();
		let status = r.u8();
		if (status < 0x80) {
			// Running status: reuse the previous status byte, this byte is data.
			r.pos--;
			status = running;
		} else if (status < 0xf0) {
			running = status;
		}
		const type = status & 0xf0;
		const channel = status & 0x0f;
		if (status === 0xff) {
			const meta = r.u8();
			const len = r.vlq();
			const blank = { channel: 0, pitch: 0, velocity: 0, usPerQuarter: 0, track };
			if (meta === 0x51 && len === 3) {
				const usPerQuarter = (r.u8() << 16) | (r.u8() << 8) | r.u8();
				events.push({ tick, kind: "tempo", ...blank, usPerQuarter });
			} else if (meta === 0x58 && len === 4) {
				const a = r.u8();
				const b = r.u8();
				r.skip(2);
				events.push({ tick, kind: "meter", ...blank, a, b });
			} else if (meta === 0x59 && len === 2) {
				const sf = r.u8();
				const mi = r.u8();
				events.push({ tick, kind: "key", ...blank, a: sf > 127 ? sf - 256 : sf, b: mi });
			} else if (meta === 0x06 || meta === 0x03) {
				const bytes = new Uint8Array(len);
				for (let i = 0; i < len; i++) bytes[i] = r.u8();
				const text = utf8.decode(bytes);
				if (meta === 0x06) events.push({ tick, kind: "marker", ...blank, text });
				else {
					names.push(text);
					nameAt[track] ??= text;
				}
			} else r.skip(len);
		} else if (status === 0xf0 || status === 0xf7) {
			r.skip(r.vlq());
		} else if (type === 0x90 || type === 0x80) {
			const pitch = r.u8();
			const velocity = r.u8();
			const on = type === 0x90 && velocity > 0;
			events.push({
				tick,
				kind: on ? "on" : "off",
				channel,
				pitch,
				velocity,
				usPerQuarter: 0,
				track,
			});
		} else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
			r.skip(2);
			others++;
		} else if (type === 0xc0 || type === 0xd0) {
			r.skip(1);
			others++;
		} else {
			break; // unknown; stop reading this track rather than misalign
		}
	}
	return others;
}

export function parseMidi(buffer: ArrayBuffer): MidiSummary {
	const r = new Reader(new DataView(buffer));
	if (r.ascii(4) !== "MThd") throw new Error("Not a MIDI file");
	const headerLength = r.u32();
	r.u16(); // format
	const trackCount = r.u16();
	const division = r.u16();
	r.skip(headerLength - 6);
	if (division & 0x8000) throw new Error("SMPTE-timed MIDI files are not supported");
	const ticksPerQuarter = division || 96;

	const events: RawEvent[] = [];
	const trackNames: string[] = [];
	const trackNameAt: (string | undefined)[] = [];
	let otherEvents = 0;
	for (let t = 0; t < trackCount && !r.done; t++) {
		if (r.ascii(4) !== "MTrk") break;
		const length = r.u32();
		otherEvents += readTrack(r, r.pos + length, events, trackNames, t, trackNameAt);
		r.pos = Math.min(r.length, r.pos);
	}
	events.sort((a, b) => a.tick - b.tick || (a.kind === "tempo" ? -1 : 0));

	// Ticks → seconds through the tempo map (120 bpm until the first tempo event).
	let usPerQuarter = 500_000;
	let lastTick = 0;
	let seconds = 0;
	const toSeconds = (tick: number) =>
		seconds + ((tick - lastTick) * usPerQuarter) / ticksPerQuarter / 1_000_000;

	const open = new Map<string, { start: number; velocity: number }>();
	const notes: MidiNote[] = [];
	const tempos: NonNullable<MidiSummary["tempos"]> = [];
	const meters: NonNullable<MidiSummary["meters"]> = [];
	const keys: NonNullable<MidiSummary["keys"]> = [];
	const markers: NonNullable<MidiSummary["markers"]> = [];
	for (const e of events) {
		const at = toSeconds(e.tick);
		if (e.kind === "tempo") {
			seconds = at;
			lastTick = e.tick;
			usPerQuarter = e.usPerQuarter;
			tempos.push({ at, bpm: Math.round((60_000_000 / usPerQuarter) * 100) / 100 });
			continue;
		}
		if (e.kind === "meter") {
			meters.push({ at, numerator: e.a!, denominator: 2 ** e.b! });
			continue;
		}
		if (e.kind === "key") {
			keys.push({ at, sharps: e.a!, minor: e.b === 1 });
			continue;
		}
		if (e.kind === "marker") {
			markers.push({ at, name: e.text ?? "" });
			continue;
		}
		const key = `${e.track}:${e.channel}:${e.pitch}`;
		if (e.kind === "on") {
			open.set(key, { start: at, velocity: e.velocity });
		} else {
			const o = open.get(key);
			if (!o) continue;
			open.delete(key);
			notes.push({
				start: o.start,
				duration: Math.max(0.01, at - o.start),
				pitch: e.pitch,
				velocity: o.velocity,
				channel: e.channel,
				track: e.track,
			});
		}
	}
	notes.sort((a, b) => a.start - b.start);
	const duration = notes.reduce((m, n) => Math.max(m, n.start + n.duration), 0);
	const pitches = notes.map((n) => n.pitch);
	return {
		notes,
		duration,
		lowest: pitches.length ? Math.min(...pitches) : 60,
		highest: pitches.length ? Math.max(...pitches) : 72,
		tempos,
		meters,
		keys,
		markers,
		trackNames,
		trackNameAt,
		trackCount,
		otherEvents,
	};
}
