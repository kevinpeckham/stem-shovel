import type { StudioInsert, StudioSend } from "#lib/val/StudioSchema.js";
import { createInsertChain, type InsertChain } from "./insertChain";

/**
 * One strip of Dawn's mixer (docs/dawn-daw-plan.md, D2), for a track, a
 * bus or the master, built the same on the live context and the offline
 * one: `fader` (mute, solo and the static level) → `auto` (the volume
 * lane) → the inserts → `pan` → `meter` and `out`. Sends tap the signal
 * after the inserts and before the pan (post-fader), or at the fader's
 * input (pre), each through its own gain into a bus's `input`. `param`
 * names what a lane can drive: the volume, the pan, a send, or an
 * insert's parameter (utils/automationLanes.ts).
 */
export interface StripGraph {
	input: GainNode;
	fader: GainNode;
	auto: GainNode;
	chain: InsertChain;
	pan: StereoPannerNode;
	meter: AnalyserNode;
	out: GainNode;
	/** The send gains by bus id. */
	sends: Map<string, GainNode>;
	setInserts(inserts: StudioInsert[], tau: number): void;
	/** Sends to the buses given (their inputs by id): a send that is gone disconnects, a new one connects. */
	setSends(sends: StudioSend[], busInputs: Map<string, AudioNode>, tau: number): void;
	/** Where the strip goes (a bus's input or the master's): the old connection dropped. */
	route(dest: AudioNode): void;
	param(key: string): AudioParam | null;
	dispose(): void;
}

export function createStripGraph(
	ctx: BaseAudioContext,
	o: { inserts: StudioInsert[]; pan: number; meterSize?: number },
): StripGraph {
	const input = ctx.createGain();
	const fader = input;
	const auto = ctx.createGain();
	const chain = createInsertChain(ctx, o.inserts);
	const pan = ctx.createStereoPanner();
	pan.pan.value = o.pan;
	const meter = ctx.createAnalyser();
	meter.fftSize = o.meterSize ?? 1024;
	const out = ctx.createGain();
	fader.connect(auto);
	auto.connect(chain.input);
	chain.output.connect(pan);
	pan.connect(meter);
	pan.connect(out);
	const sends = new Map<string, GainNode>();
	const sendTaps = new Map<string, "pre" | "post">();
	let routed: AudioNode | null = null;
	const strip: StripGraph = {
		input,
		fader,
		auto,
		chain,
		pan,
		meter,
		out,
		sends,
		setInserts: (inserts, tau) => chain.update(inserts, tau),
		setSends(list, busInputs, tau) {
			for (const [busId, gain] of sends) {
				if (!list.some((s) => s.bus === busId) || !busInputs.has(busId)) {
					gain.disconnect();
					sends.delete(busId);
					sendTaps.delete(busId);
				}
			}
			for (const s of list) {
				const busInput = busInputs.get(s.bus);
				if (!busInput) continue;
				const tap: "pre" | "post" = s.pre ? "pre" : "post";
				let gain = sends.get(s.bus);
				if (gain && sendTaps.get(s.bus) !== tap) {
					gain.disconnect();
					gain = undefined;
				}
				if (!gain) {
					gain = ctx.createGain();
					gain.gain.value = s.level;
					(tap === "pre" ? input : chain.output).connect(gain);
					gain.connect(busInput);
					sends.set(s.bus, gain);
					sendTaps.set(s.bus, tap);
				} else if (tau > 0) gain.gain.setTargetAtTime(s.level, ctx.currentTime, tau);
				else gain.gain.value = s.level;
			}
		},
		route(dest) {
			if (routed === dest) return;
			out.disconnect();
			out.connect(dest);
			routed = dest;
		},
		param(key) {
			if (key === "volume") return auto.gain;
			if (key === "pan") return pan.pan;
			const send = /^send:(.+)$/.exec(key);
			if (send) return sends.get(send[1]!)?.gain ?? null;
			const insert = /^insert:([^:]+):(.+)$/.exec(key);
			if (insert) return chain.params(insert[1]!)?.[insert[2]!] ?? null;
			return null;
		},
		dispose() {
			input.disconnect();
			auto.disconnect();
			chain.dispose();
			pan.disconnect();
			meter.disconnect();
			out.disconnect();
			for (const g of sends.values()) g.disconnect();
			sends.clear();
		},
	};
	return strip;
}
