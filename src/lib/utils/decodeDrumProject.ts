import * as v from "valibot";
import {
	DRUM_BPM_MIN,
	DRUM_KIT_IDS,
	DRUM_METER_IDS,
	DRUM_STEP_CHOICES,
	DRUM_STEP_CHOICES_V2,
	DRUM_VOICE_IDS,
} from "$lib/constants/drumMachine";
import {
	DrumProjectSchema,
	DrumProjectV1Schema,
	type DrumProject,
} from "$lib/val/DrumPatternSchema";
import { BitReader } from "./bitReader";
import { upgradeDrumProject } from "./upgradeDrumProject";

/**
 * The project a share link carries, or null when the string is not one
 * (a hand-edited link, a version this build does not read, values out of
 * range). Reads every version there has been: version 1 links open as
 * one-pattern projects, version 2 links as 4/4 projects. The result is checked against the schema so
 * nothing past the codec is trusted.
 */
export function decodeDrumProject(encoded: string): DrumProject | null {
	try {
		const b64 = encoded.replaceAll("-", "+").replaceAll("_", "/");
		const binary = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
		const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
		const r = new BitReader(bytes);
		const version = r.read(8);
		if (version === 1) return decodeV1(r);
		if (version === 2) return decodeV2(r);
		if (version === 3) return decodeV3(r);
		return null;
	} catch {
		return null;
	}
}

function readRow(r: BitReader, steps: number, withPan: boolean) {
	const voice = DRUM_VOICE_IDS[r.read(4)];
	const level = r.read(7) / 100;
	const pan = withPan ? (r.read(8) - 100) / 100 : 0;
	const mute = r.read(1) === 1;
	const cells = [];
	for (let i = 0; i < steps; i++) cells.push(r.read(2));
	return { voice, level, pan, mute, cells };
}

function decodeV1(r: BitReader): DrumProject | null {
	const bpm = r.read(8) + DRUM_BPM_MIN;
	const swing = r.read(7) / 100;
	const steps = DRUM_STEP_CHOICES_V2[r.read(2)];
	const kit = DRUM_KIT_IDS[r.read(2)];
	const count = r.read(4);
	if (!steps || !kit) return null;
	const rows = [];
	for (let n = 0; n < count; n++) {
		const { pan: _pan, ...row } = readRow(r, steps, false);
		rows.push(row);
	}
	const parsed = v.safeParse(DrumProjectV1Schema, { v: 1, bpm, swing, steps, kit, rows });
	return parsed.success ? upgradeDrumProject(parsed.output) : null;
}

/** Versions 2 and 3 share a shape; 3 adds the meter and a wider steps field. */
function decodeProject(r: BitReader, version: 2 | 3): DrumProject | null {
	const bpm = r.read(8) + DRUM_BPM_MIN;
	const swing = r.read(7) / 100;
	const humanize = r.read(7) / 100;
	const kit = DRUM_KIT_IDS[r.read(2)];
	const patternCount = r.read(3) + 1;
	if (!kit) return null;
	const patterns = [];
	for (let n = 0; n < patternCount; n++) {
		const meter = version === 3 ? DRUM_METER_IDS[r.read(2)] : "4/4";
		const steps = version === 3 ? DRUM_STEP_CHOICES[r.read(3)] : DRUM_STEP_CHOICES_V2[r.read(2)];
		const rowCount = r.read(4);
		if (!steps || !meter) return null;
		const rows = [];
		for (let i = 0; i < rowCount; i++) rows.push(readRow(r, steps, true));
		patterns.push({ meter, steps, rows });
	}
	const parsed = v.safeParse(DrumProjectSchema, { v: 2, bpm, swing, humanize, kit, patterns });
	return parsed.success ? parsed.output : null;
}
const decodeV2 = (r: BitReader) => decodeProject(r, 2);
const decodeV3 = (r: BitReader) => decodeProject(r, 3);
