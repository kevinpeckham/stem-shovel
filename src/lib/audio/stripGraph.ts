import { monoPanCurves } from "#lib/utils/monoPan.js";
import type { StudioInsert, StudioSend } from "#lib/val/StudioSchema.js";
import { createInsertChain, type InsertChain } from "./insertChain";

/**
 * One strip of Dawn's mixer (docs/dawn-daw-plan.md, D2), for a track, a
 * bus or the master, built the same on the live context and the offline
 * one: `fader` (mute, solo and the static level) → `auto` (the volume
 * lane) → `mute` (the mute lane, a gain of 0 while it says muted) → the
 * inserts → `pan` → `meter` and `out`. Sends tap the signal after the
 * inserts and before the pan (post-fader), or at the fader's input
 * (pre), each through its own gain into a bus's `input`. `param` names
 * what a lane can drive: the volume, the pan, the mute, a send, or an
 * insert's parameter (utils/automationLanes.ts). A mono strip
 * (docs/multitrack-recorder.md "Mono tracks") sums its input to one
 * channel at the fader, so the inserts process one, and pans it as a
 * point source (utils/monoPan.ts) instead of through a StereoPannerNode.
 */
export interface StripGraph {
	input: GainNode;
	fader: GainNode;
	auto: GainNode;
	mute: GainNode;
	chain: InsertChain;
	/** The pan stage's parameter (a StereoPannerNode's `pan`, or the mono stage's position), −1…1. */
	readonly pan: { readonly pan: AudioParam };
	readonly mono: boolean;
	/** Swap the pan stage between stereo and mono, the pan kept. */
	setMono(mono: boolean): void;
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

/** The pan stage: what the inserts feed, what reaches the meter and the output, and the parameter a lane drives. */
interface PanStage {
	input: AudioNode;
	output: AudioNode;
	param: AudioParam;
	dispose(): void;
}

function stereoStage(ctx: BaseAudioContext, pan: number): PanStage {
	const panner = ctx.createStereoPanner();
	panner.pan.value = pan;
	return { input: panner, output: panner, param: panner.pan, dispose: () => panner.disconnect() };
}

/**
 * The mono stage: the signal summed to one channel, then into two gains
 * (left and right) and a merger. A constant source holds the pan as its
 * offset, and two WaveShapers turn it into each gain's weight through the
 * mono law, so the one offset is the pan parameter a lane schedules.
 */
function monoStage(ctx: BaseAudioContext, pan: number): PanStage {
	const sum = ctx.createGain();
	sum.channelCount = 1;
	sum.channelCountMode = "explicit";
	const left = ctx.createGain();
	const right = ctx.createGain();
	left.gain.value = 0;
	right.gain.value = 0;
	const merger = ctx.createChannelMerger(2);
	const position = ctx.createConstantSource();
	position.offset.value = pan;
	const curves = monoPanCurves();
	const shapeLeft = ctx.createWaveShaper();
	shapeLeft.curve = curves.left;
	const shapeRight = ctx.createWaveShaper();
	shapeRight.curve = curves.right;
	position.connect(shapeLeft).connect(left.gain);
	position.connect(shapeRight).connect(right.gain);
	position.start();
	sum.connect(left);
	sum.connect(right);
	left.connect(merger, 0, 0);
	right.connect(merger, 0, 1);
	return {
		input: sum,
		output: merger,
		param: position.offset,
		dispose() {
			position.stop();
			position.disconnect();
			shapeLeft.disconnect();
			shapeRight.disconnect();
			sum.disconnect();
			left.disconnect();
			right.disconnect();
			merger.disconnect();
		},
	};
}

export function createStripGraph(
	ctx: BaseAudioContext,
	o: { inserts: StudioInsert[]; pan: number; mono?: boolean; meterSize?: number },
): StripGraph {
	const input = ctx.createGain();
	const fader = input;
	const auto = ctx.createGain();
	const mute = ctx.createGain();
	const chain = createInsertChain(ctx, o.inserts);
	let mono = !!o.mono;
	let stage = mono ? monoStage(ctx, o.pan) : stereoStage(ctx, o.pan);
	const meter = ctx.createAnalyser();
	meter.fftSize = o.meterSize ?? 1024;
	const out = ctx.createGain();
	/** A mono strip's input takes one channel, so the inserts process one. */
	const shapeInput = () => {
		input.channelCountMode = mono ? "explicit" : "max";
		input.channelCount = mono ? 1 : 2;
	};
	shapeInput();
	fader.connect(auto);
	auto.connect(mute);
	mute.connect(chain.input);
	chain.output.connect(stage.input);
	stage.output.connect(meter);
	stage.output.connect(out);
	const sends = new Map<string, GainNode>();
	const sendTaps = new Map<string, "pre" | "post">();
	let routed: AudioNode | null = null;
	const strip: StripGraph = {
		input,
		fader,
		auto,
		mute,
		chain,
		get pan() {
			return { pan: stage.param };
		},
		get mono() {
			return mono;
		},
		setMono(next) {
			if (next === mono) return;
			const pan = stage.param.value;
			chain.output.disconnect(stage.input);
			stage.dispose();
			mono = next;
			stage = mono ? monoStage(ctx, pan) : stereoStage(ctx, pan);
			shapeInput();
			chain.output.connect(stage.input);
			stage.output.connect(meter);
			stage.output.connect(out);
		},
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
			if (key === "pan") return stage.param;
			if (key === "mute") return mute.gain;
			const send = /^send:(.+)$/.exec(key);
			if (send) return sends.get(send[1]!)?.gain ?? null;
			const insert = /^insert:([^:]+):(.+)$/.exec(key);
			if (insert) return chain.params(insert[1]!)?.[insert[2]!] ?? null;
			return null;
		},
		dispose() {
			input.disconnect();
			auto.disconnect();
			mute.disconnect();
			chain.dispose();
			stage.dispose();
			meter.disconnect();
			out.disconnect();
			for (const g of sends.values()) g.disconnect();
			sends.clear();
		},
	};
	return strip;
}
