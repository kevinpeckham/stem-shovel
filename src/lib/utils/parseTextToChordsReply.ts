import * as v from "valibot";
import { parseChart, printParsed } from "barmark";
import type { ChordStyleId } from "#lib/constants/chordStyles.js";
import type { DemoSetup } from "#lib/constants/demoProgressions.js";
import { TextToChordsReplySchema, type TextToChordsReply } from "#lib/val/TextToChordsSchema.js";

export interface TextToChordsResult {
	name: string;
	note: string;
	style: ChordStyleId | null;
	/** The progression as a barmark chord chart, in barmark's canonical print: its key, meter, tempo and feel in its directives. */
	chart: string;
	/** How the model set the player up (the sound, voicing, strum, arpeggiator, octave, sustain, effects), in the demos' shape; empty when it said nothing. */
	setup: DemoSetup;
}

/**
 * The model's reply as a chord chart (docs/chord-player.md,
 * "Text-to-Progression"): the first JSON object in the text, checked
 * against TextToChordsReplySchema, its `chart` read by barmark. Throws
 * with a reason the caller can hand back to the model for another go: the
 * chart's errors by line ("line 3: …"), or that it has no bars.
 */
export function parseTextToChordsReply(text: string): TextToChordsResult {
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
	const chart = parseChart(reply.chart);
	const errors = chart.diagnostics
		.filter((d) => d.severity === "error")
		.map((d) => `line ${d.line}: ${d.message}`);
	if (errors.length > 0) throw new Error(`the chart has errors: ${errors.join("; ")}`);
	if (chart.bars.length === 0) throw new Error("the chart has no bars");
	return {
		name: (reply.name ?? "").trim() || "From a description",
		note: reply.note ?? "",
		style: reply.style ?? null,
		chart: printParsed(reply.chart, chart),
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
