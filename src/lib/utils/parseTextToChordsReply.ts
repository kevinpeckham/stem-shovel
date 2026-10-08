import * as v from "valibot";
import type { ChordStyleId } from "#lib/constants/chordStyles.js";
import type { DemoChord, DemoSetup } from "#lib/constants/demoProgressions.js";
import {
	CHORD_DEGREE_NUMERALS,
	KEY_NAMES,
	TextToChordsReplySchema,
	type TextToChordsReply,
} from "#lib/val/TextToChordsSchema.js";

export interface TextToChordsResult {
	name: string;
	note: string;
	bpm: number | null;
	/** The circle position of the key the model chose; null leaves the circle where it is. */
	keyCenter: number | null;
	style: ChordStyleId | null;
	chords: DemoChord[];
	/** How the model set the player up (the sound, voicing, strum, arpeggiator, octave, sustain, effects), in the demos' shape; empty when it said nothing. */
	setup: DemoSetup;
}

/** A numeral's distance from the key clockwise in fifths (constants/demoProgressions.ts), by its uppercase form. */
const FIFTHS: Record<(typeof CHORD_DEGREE_NUMERALS)[number], number> = {
	I: 0,
	II: 2,
	III: 4,
	IV: 11,
	V: 1,
	VI: 3,
	VII: 5,
	bII: 7,
	bIII: 9,
	"#IV": 6,
	bV: 6,
	bVI: 8,
	bVII: 10,
};

/**
 * The model's reply as a progression by degree (docs/chord-player.md,
 * "Text-to-Progression"): the first JSON object in the text, checked
 * against TextToChordsReplySchema, each chord's numeral read for its
 * degree (I, ii, bVII, #iv…) and its case for the quality unless the reply
 * says, a seventh and its beats (a whole bar unless said). Throws with a
 * reason the caller can hand back to the model for another go.
 */
export function parseTextToChordsReply(text: string, beatsPerBar: 3 | 4): TextToChordsResult {
	const json = text.match(/\{[\s\S]*\}/)?.[0];
	if (!json) throw new Error("no JSON object in the reply");
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		throw new Error("the JSON does not parse");
	}
	const parsed = v.safeParse(TextToChordsReplySchema, raw);
	if (!parsed.success) {
		const issue = parsed.issues[0];
		const path = issue.path?.map((p) => String(p.key)).join(".") ?? "";
		throw new Error(`${path ? `${path}: ` : ""}${issue.message}`);
	}
	const reply = parsed.output;
	const chords: DemoChord[] = reply.chords.map((c) => {
		const m = c.degree
			.replace(/♭/g, "b")
			.replace(/♯/g, "#")
			.match(/^([b#]?)([ivIV]+)$/);
		const upper = m ? `${m[1]}${m[2].toUpperCase()}` : "";
		if (!m || !(upper in FIFTHS))
			throw new Error(`"${c.degree}" is not a degree I know (I to VII, bII, bIII, #IV, bVI, bVII)`);
		const minor = c.quality ? c.quality === "minor" : m[2] === m[2].toLowerCase();
		const beats = c.beats ?? (beatsPerBar === 3 ? 2 : 4);
		return {
			fifths: FIFTHS[upper as keyof typeof FIFTHS],
			quality: minor ? "minor" : "major",
			beats: beats as 1 | 2 | 4,
			seventh: c.seventh === true,
		};
	});
	return {
		name: (reply.name ?? "").trim() || "From a description",
		note: reply.note ?? "",
		bpm: reply.bpm ?? null,
		keyCenter: reply.key ? KEY_NAMES.indexOf(reply.key) : null,
		style: reply.style ?? null,
		chords,
		setup: replySetup(reply.setup),
	};
}

/** The reply's setup as a demo's: nulls and absent fields left out, percentages to levels. */
function replySetup(s: TextToChordsReply["setup"]): DemoSetup {
	if (!s) return {};
	const out: DemoSetup = {};
	const unit = (v: number | null | undefined) =>
		v === null || v === undefined ? undefined : Math.round(v) / 100;
	if (s.mode) out.mode = s.mode;
	if (s.sound) out.instrument = s.sound;
	if (s.voicing) out.voicing = s.voicing;
	if (s.strum) out.strum = s.strum;
	if (s.strumDirection) out.strumDirection = s.strumDirection;
	if (s.strumPattern) out.strumPattern = s.strumPattern;
	if (s.strumSpeed) out.strumSpeed = s.strumSpeed;
	if (s.arp) {
		out.arp = { on: s.arp.on };
		if (s.arp.rate) out.arp.rate = s.arp.rate;
		if (s.arp.pattern) out.arp.pattern = s.arp.pattern;
		if (s.arp.octaves !== null && s.arp.octaves !== undefined) out.arp.octaves = s.arp.octaves;
		const gate = unit(s.arp.gate);
		if (gate !== undefined) out.arp.gate = gate;
		if (s.arp.latch !== null && s.arp.latch !== undefined) out.arp.latch = s.arp.latch;
		const swing = unit(s.arp.swing);
		if (swing !== undefined) out.arp.swing = swing;
		if (s.arp.ratio !== null && s.arp.ratio !== undefined) out.arp.ratio = s.arp.ratio;
	}
	if (s.octave !== null && s.octave !== undefined) out.octave = s.octave;
	if (s.sustain !== null && s.sustain !== undefined) out.sustain = s.sustain;
	if (s.effects) {
		const effects: NonNullable<DemoSetup["effects"]> = {};
		const reverb = unit(s.effects.reverb);
		const reverbSize = unit(s.effects.reverbSize);
		const delayLevel = unit(s.effects.delay);
		const chorusMix = unit(s.effects.chorus);
		if (reverb !== undefined) effects.reverb = reverb;
		if (reverbSize !== undefined) effects.reverbSize = reverbSize;
		if (delayLevel !== undefined) effects.delayLevel = delayLevel;
		if (chorusMix !== undefined) effects.chorusMix = chorusMix;
		if (Object.keys(effects).length) out.effects = effects;
	}
	return out;
}
