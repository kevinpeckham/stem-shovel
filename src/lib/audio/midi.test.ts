import { describe, expect, test } from "vite-plus/test";
import { parseMidi } from "./midi";

/** Builds a one-track SMF (96 ticks a quarter) from raw track bytes. */
function smf(track: number[]) {
	const head = [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96];
	const len = track.length;
	const trk = [
		0x4d,
		0x54,
		0x72,
		0x6b,
		(len >>> 24) & 255,
		(len >>> 16) & 255,
		(len >>> 8) & 255,
		len & 255,
		...track,
	];
	return new Uint8Array([...head, ...trk]).buffer;
}

describe("parseMidi", () => {
	test("reads notes with durations at the default 120 bpm", () => {
		// C4 on at 0, off after 96 ticks (a quarter = 0.5 s); E4 on at the same tick as the off, off 48 ticks later.
		const { notes, duration, lowest, highest } = parseMidi(
			smf([0, 0x90, 60, 100, 96, 0x80, 60, 0, 0, 0x90, 64, 80, 48, 0x80, 64, 0, 0, 0xff, 0x2f, 0]),
		);
		expect(notes).toEqual([
			{ start: 0, duration: 0.5, pitch: 60, velocity: 100, channel: 0 },
			{ start: 0.5, duration: 0.25, pitch: 64, velocity: 80, channel: 0 },
		]);
		expect(duration).toBe(0.75);
		expect([lowest, highest]).toEqual([60, 64]);
	});
	test("honours a tempo change and running status, and treats velocity 0 as note off", () => {
		// tempo 60 bpm (1 000 000 µs a quarter), then C4 on, running-status C4 off with velocity 0 after 96 ticks
		const { notes } = parseMidi(
			smf([0, 0xff, 0x51, 3, 0x0f, 0x42, 0x40, 0, 0x90, 60, 90, 96, 60, 0, 0, 0xff, 0x2f, 0]),
		);
		expect(notes).toEqual([{ start: 0, duration: 1, pitch: 60, velocity: 90, channel: 0 }]);
	});
	test("rejects other files", () => {
		expect(() => parseMidi(new Uint8Array([1, 2, 3, 4]).buffer)).toThrow(/Not a MIDI file/);
	});
});
