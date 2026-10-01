import * as v from "valibot";
import { DRUM_DELAY_TIMES, type DrumMeterId, type DrumSteps } from "$lib/constants/drumMachine";
import { TextToBeatReplySchema, type TextToBeatReply } from "$lib/val/TextToBeatSchema";
import type { DrumFx, DrumPattern } from "$lib/val/DrumPatternSchema";
import { drumPresetProject } from "./drumPresetProject";

export interface TextToBeatResult {
	pattern: DrumPattern;
	bpm: number | null;
	swing: number | null;
	note: string;
	/** Effects the description asked for, over the defaults; null for a dry beat. */
	fx: Partial<DrumFx> | null;
}

/**
 * The model's reply as a pattern (docs/drum-machine.md, "Text-to-Beat"):
 * the first JSON object in the text (models wrap it in prose or fences),
 * checked against TextToBeatReplySchema, its rows read like a preset's
 * (drumPresetProject), every row exactly the pattern's length, the swing
 * from a percentage to the project's 0 to 1, silent rows left out. Throws
 * with a reason the caller can hand back to the model for another go.
 */
export function parseTextToBeatReply(
	text: string,
	meter: DrumMeterId,
	steps: DrumSteps,
): TextToBeatResult {
	const json = text.match(/\{[\s\S]*\}/)?.[0];
	if (!json) throw new Error("no JSON object in the reply");
	let raw: unknown;
	try {
		raw = JSON.parse(json);
	} catch {
		throw new Error("the JSON does not parse");
	}
	const parsed = v.safeParse(TextToBeatReplySchema, raw);
	if (!parsed.success) {
		const issue = parsed.issues[0];
		const path = issue.path?.map((p) => String(p.key)).join(".") ?? "";
		throw new Error(`${path ? `${path}: ` : ""}${issue.message}`);
	}
	const reply = parsed.output;
	for (const row of reply.rows) {
		if (row.cells.length !== steps)
			throw new Error(
				`${row.voice}: ${row.cells.length} characters, but every row must be exactly ${steps}`,
			);
	}
	const project = drumPresetProject({
		id: "text-to-beat",
		name: "Text-to-Beat",
		style: "",
		bpm: reply.bpm ?? 100,
		meter,
		patterns: [reply.rows],
	});
	// Models pad the answer with rows that never sound: leave those out (unless nothing sounds at all).
	const pattern = project.patterns[0]!;
	const sounding = pattern.rows.filter((r) => r.cells.some(Boolean));
	if (sounding.length) pattern.rows = sounding;
	return {
		pattern,
		bpm: reply.bpm ?? null,
		swing: reply.swing === null || reply.swing === undefined ? null : Math.round(reply.swing) / 100,
		note: reply.note ?? "",
		fx: replyFx(reply.fx),
	};
}

/** The reply's effects as the project keeps them: percentages to levels, the delay's label to its steps; null when the model named none. */
function replyFx(fx: TextToBeatReply["fx"]): Partial<DrumFx> | null {
	if (!fx) return null;
	const out: Partial<DrumFx> = {};
	const unit = (v: number | null | undefined) =>
		v === null || v === undefined ? undefined : Math.round(v) / 100;
	const reverb = unit(fx.reverb);
	if (reverb !== undefined) out.reverbReturn = reverb;
	const delay = unit(fx.delay);
	if (delay !== undefined) out.delayReturn = delay;
	const fuzz = unit(fx.fuzz);
	if (fuzz !== undefined) out.fuzzDrive = fuzz;
	const wah = unit(fx.wah);
	if (wah !== undefined) out.wahMix = wah;
	const time = DRUM_DELAY_TIMES.find((d) => d.label === fx.delayTime);
	if (time) out.delayTime = time.steps;
	return Object.keys(out).length ? out : null;
}
