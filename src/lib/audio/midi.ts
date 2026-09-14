/**
 * A small Standard MIDI File reader: enough to draw a piano roll. Tracks are
 * merged, tempo changes are honoured when converting ticks to seconds, and
 * only note on/off matter — everything else is skipped.
 */
export interface MidiNote {
	/** Seconds from the start of the file. */
	start: number;
	duration: number;
	/** 0–127; 60 is middle C. */
	pitch: number;
	velocity: number;
	channel: number;
}

export interface MidiSummary {
	notes: MidiNote[];
	/** End of the last note, in seconds. */
	duration: number;
	lowest: number;
	highest: number;
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
	kind: "on" | "off" | "tempo";
	channel: number;
	pitch: number;
	velocity: number;
	usPerQuarter: number;
}

function readTrack(r: Reader, end: number, events: RawEvent[]) {
	let tick = 0;
	let running = 0;
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
			if (meta === 0x51 && len === 3) {
				const usPerQuarter = (r.u8() << 16) | (r.u8() << 8) | r.u8();
				events.push({ tick, kind: "tempo", channel: 0, pitch: 0, velocity: 0, usPerQuarter });
			} else r.skip(len);
		} else if (status === 0xf0 || status === 0xf7) {
			r.skip(r.vlq());
		} else if (type === 0x90 || type === 0x80) {
			const pitch = r.u8();
			const velocity = r.u8();
			const on = type === 0x90 && velocity > 0;
			events.push({ tick, kind: on ? "on" : "off", channel, pitch, velocity, usPerQuarter: 0 });
		} else if (type === 0xa0 || type === 0xb0 || type === 0xe0) {
			r.skip(2);
		} else if (type === 0xc0 || type === 0xd0) {
			r.skip(1);
		} else {
			break; // unknown; stop reading this track rather than misalign
		}
	}
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
	for (let t = 0; t < trackCount && !r.done; t++) {
		if (r.ascii(4) !== "MTrk") break;
		const length = r.u32();
		readTrack(r, r.pos + length, events);
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
	for (const e of events) {
		const at = toSeconds(e.tick);
		if (e.kind === "tempo") {
			seconds = at;
			lastTick = e.tick;
			usPerQuarter = e.usPerQuarter;
			continue;
		}
		const key = `${e.channel}:${e.pitch}`;
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
	};
}
