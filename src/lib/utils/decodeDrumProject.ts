import * as v from "valibot";
import {
	DRUM_BPM_MIN,
	DEFAULT_DRUM_FX,
	DRUM_DELAY_STEPS,
	DRUM_KIT_IDS,
	DRUM_METER_IDS,
	DRUM_STEP_CHOICES,
	DRUM_STEP_CHOICES_V2,
	DRUM_SWING_GRIDS,
	DRUM_VOICE_IDS,
	DRUM_WAH_BAR_CHOICES,
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
		if (version === 4) return decodeV4(r);
		if (version === 5) return decodeV5(r);
		if (version === 6) return decodeV6(r);
		if (version === 7) return decodeV7(r);
		if (version === 8) return decodeV8(r);
		return null;
	} catch {
		return null;
	}
}

function readRow(r: BitReader, steps: number, withPan: boolean, withSends = false) {
	const voice = DRUM_VOICE_IDS[r.read(4)];
	const level = r.read(7) / 100;
	const pan = withPan ? (r.read(8) - 100) / 100 : 0;
	const mute = r.read(1) === 1;
	// Links before version 5 carry no sends: the schema fills in the voice's defaults.
	const delaySend = withSends ? r.read(7) / 100 : undefined;
	const reverbSend = withSends ? r.read(7) / 100 : undefined;
	const cells = [];
	for (let i = 0; i < steps; i++) cells.push(r.read(2));
	return { voice, level, pan, mute, delaySend, reverbSend, cells };
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
		const { pan: _pan, delaySend: _d, reverbSend: _v, ...row } = readRow(r, steps, false);
		rows.push(row);
	}
	const parsed = v.safeParse(DrumProjectV1Schema, { v: 1, bpm, swing, steps, kit, rows });
	return parsed.success ? upgradeDrumProject(parsed.output) : null;
}

/** Versions 2 to 8 share a shape; 3 adds the meter and a wider steps field, 4 the swing grid, 5 the effects, 6 the timeline, 7 the analog delay and the fuzz, 8 the wah. */
function decodeProject(r: BitReader, version: 2 | 3 | 4 | 5 | 6 | 7 | 8): DrumProject | null {
	const bpm = r.read(8) + DRUM_BPM_MIN;
	const swing = r.read(7) / 100;
	const humanize = r.read(7) / 100;
	const swingGrid = version >= 4 ? DRUM_SWING_GRIDS[r.read(1)] : 16;
	const fx =
		version >= 5
			? {
					delayTime: DRUM_DELAY_STEPS[r.read(3)],
					delayFeedback: r.read(7) / 100,
					delayReturn: r.read(7) / 100,
					reverbSize: r.read(7) / 100,
					reverbReturn: r.read(7) / 100,
					// Links before version 7 carry no analog flag or fuzz: the schema fills in off.
					...(version >= 7
						? {
								delayAnalog: r.read(1) === 1,
								fuzzDrive: r.read(7) / 100,
								fuzzTone: r.read(7) / 100,
							}
						: {}),
					...(version >= 8
						? {
								wahBars: DRUM_WAH_BAR_CHOICES[r.read(3)],
								wahRange: r.read(7) / 100,
								wahResonance: r.read(7) / 100,
								wahMix: r.read(7) / 100,
							}
						: {}),
				}
			: { ...DEFAULT_DRUM_FX };
	const kit = DRUM_KIT_IDS[r.read(2)];
	const patternCount = r.read(3) + 1;
	if (!kit) return null;
	const patterns = [];
	for (let n = 0; n < patternCount; n++) {
		const meter = version >= 3 ? DRUM_METER_IDS[r.read(2)] : "4/4";
		const steps = version >= 3 ? DRUM_STEP_CHOICES[r.read(3)] : DRUM_STEP_CHOICES_V2[r.read(2)];
		const rowCount = r.read(4);
		if (!steps || !meter) return null;
		const rows = [];
		for (let i = 0; i < rowCount; i++) rows.push(readRow(r, steps, true, version >= 5));
		patterns.push({ meter, steps, rows });
	}
	const timeline: number[] = [];
	if (version >= 6) {
		const bars = r.read(7);
		for (let i = 0; i < bars; i++) timeline.push(r.read(3));
	}
	const parsed = v.safeParse(DrumProjectSchema, {
		v: 2,
		bpm,
		swing,
		swingGrid,
		humanize,
		fx,
		kit,
		patterns,
		timeline,
	});
	return parsed.success ? parsed.output : null;
}
const decodeV2 = (r: BitReader) => decodeProject(r, 2);
const decodeV3 = (r: BitReader) => decodeProject(r, 3);
const decodeV4 = (r: BitReader) => decodeProject(r, 4);
const decodeV5 = (r: BitReader) => decodeProject(r, 5);
const decodeV6 = (r: BitReader) => decodeProject(r, 6);
const decodeV7 = (r: BitReader) => decodeProject(r, 7);
const decodeV8 = (r: BitReader) => decodeProject(r, 8);
