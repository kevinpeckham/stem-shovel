import type { StudioInsert } from "#lib/val/StudioSchema.js";
import { MIX_STAGES, type MixStage } from "./mixStages";

/**
 * A strip's inserts in series (docs/dawn-daw-plan.md, D2): `input` →
 * each insert's stage in the list's order → `output`, a bypassed insert
 * passed round. `update` takes the list whole: when the ids, kinds,
 * order or bypasses are what they were, each stage just takes its new
 * settings (ramped over `tau`); otherwise the stages are rewired, the
 * ones whose id and kind survive kept with their state. `params(id)` are
 * an insert's AudioParams for its lanes (null once it is gone).
 */
export interface InsertChain {
	input: AudioNode;
	output: AudioNode;
	update(inserts: StudioInsert[], tau: number): void;
	params(insertId: string): Record<string, AudioParam> | null;
	dispose(): void;
}

export function createInsertChain(ctx: BaseAudioContext, initial: StudioInsert[]): InsertChain {
	const input = ctx.createGain();
	const output = ctx.createGain();
	let stages = new Map<string, { kind: string; stage: MixStage }>();
	// Null until the first wiring, so an empty list still connects the input to the output.
	let wiring: string | null = null;
	const wiringOf = (list: StudioInsert[]) =>
		list.map((i) => `${i.id}:${i.kind}:${i.bypass ? 1 : 0}`).join("|");

	function rewire(list: StudioInsert[]) {
		input.disconnect();
		for (const { stage } of stages.values()) stage.output.disconnect();
		const next = new Map<string, { kind: string; stage: MixStage }>();
		let from: AudioNode = input;
		for (const insert of list) {
			const kept = stages.get(insert.id);
			const entry =
				kept && kept.kind === insert.kind
					? kept
					: { kind: insert.kind, stage: MIX_STAGES[insert.kind](ctx) };
			next.set(insert.id, entry);
			if (insert.bypass) continue;
			from.connect(entry.stage.input);
			from = entry.stage.output;
		}
		from.connect(output);
		stages = next;
		wiring = wiringOf(list);
	}

	function update(list: StudioInsert[], tau: number) {
		if (wiringOf(list) !== wiring) rewire(list);
		for (const insert of list) stages.get(insert.id)?.stage.update(insert.settings, tau);
	}

	update(initial, 0);
	return {
		input,
		output,
		update,
		params: (id) => stages.get(id)?.stage.params ?? null,
		dispose() {
			input.disconnect();
			for (const { stage } of stages.values()) stage.output.disconnect();
			output.disconnect();
			stages.clear();
		},
	};
}
