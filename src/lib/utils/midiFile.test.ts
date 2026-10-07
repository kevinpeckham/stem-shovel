import { describe, expect, it } from "vite-plus/test";
import { parseMidi } from "$lib/audio/midi";
import {
	MIDI_PPQ,
	midiFile,
	midiNoteOff,
	midiNoteOn,
	midiProgram,
	midiTempo,
	midiTimeSignature,
} from "./midiFile";

const bytes = async (blob: Blob) => Array.from(new Uint8Array(await blob.arrayBuffer()));

describe("midi events", () => {
	it("lay out their bytes", () => {
		expect(midiTempo(0, 120).bytes).toEqual([0xff, 0x51, 0x03, 0x07, 0xa1, 0x20]);
		expect(midiTimeSignature(0, 6, 3, 36).bytes).toEqual([0xff, 0x58, 0x04, 6, 3, 36, 8]);
		expect(midiNoteOn(0, 9, 36, 100).bytes).toEqual([0x99, 36, 100]);
		expect(midiNoteOff(0, 9, 36).bytes).toEqual([0x89, 36, 0]);
		expect(midiProgram(0, 0, 5).bytes).toEqual([0xc0, 5]);
	});
	it("keep a note-on audible and inside the range", () => {
		expect(midiNoteOn(0, 0, 60, 0).bytes[2]).toBe(1);
		expect(midiNoteOn(0, 0, 60, 300).bytes[2]).toBe(127);
		expect(midiNoteOn(0, 16, 200, 64).bytes).toEqual([0x90, 72, 64]);
	});
});

describe("midiFile", () => {
	it("writes a format 0 file: header, one track, delta times, no running status", async () => {
		const blob = midiFile(
			[midiNoteOn(96, 0, 60, 100), midiTempo(0, 120), midiNoteOff(96, 0, 62)],
			MIDI_PPQ,
			300,
		);
		expect(blob.type).toBe("audio/midi");
		const track = [
			[0, 0xff, 0x51, 0x03, 0x07, 0xa1, 0x20],
			// 96 ticks on: the note-off first when ticks tie, then the note-on, each with its status byte.
			[0x60, 0x80, 62, 0],
			[0, 0x90, 60, 100],
			// End of track at tick 300: 204 later, a two-byte variable-length delta.
			[0x81, 0x4c, 0xff, 0x2f, 0],
		].flat();
		expect(await bytes(blob)).toEqual(
			[
				[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
				[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, track.length],
				track,
			].flat(),
		);
	});
	it("ends an empty event list at once and a long one after its last event", async () => {
		expect(await bytes(midiFile([]))).toEqual(
			[
				[0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0, 96],
				[0x4d, 0x54, 0x72, 0x6b, 0, 0, 0, 4, 0, 0xff, 0x2f, 0],
			].flat(),
		);
		const late = await bytes(midiFile([midiNoteOn(16384, 0, 60, 1)], 480, 10));
		// 16384 = 0x80 0x80 0x00 as a variable-length quantity, and the end comes right after.
		expect(late.slice(12, 14)).toEqual([1, 0xe0]);
		expect(late.slice(22)).toEqual([0x81, 0x80, 0, 0x90, 60, 1, 0, 0xff, 0x2f, 0]);
	});
	it("is read back by parseMidi with the tempo honoured", async () => {
		const blob = midiFile([
			midiTempo(0, 60),
			midiNoteOn(0, 2, 60, 80),
			midiNoteOff(96, 2, 60),
			midiNoteOn(96, 2, 64, 90),
			midiNoteOff(144, 2, 64),
		]);
		expect(parseMidi(await blob.arrayBuffer()).notes).toEqual([
			{ start: 0, duration: 1, pitch: 60, velocity: 80, channel: 2 },
			{ start: 1, duration: 0.5, pitch: 64, velocity: 90, channel: 2 },
		]);
	});
});
