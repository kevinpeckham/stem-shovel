import { afterEach, beforeEach, describe, expect, it, vi } from "vite-plus/test";
import { STREAM_LEAD_S, STREAM_WINDOW_S, StreamVoice, type StreamRead } from "./streamVoice";

type Posted = { type: string; fromFrame?: number; planes?: Float32Array[]; [k: string]: unknown };

/** The worklet node's stand-in: what it was posted, and a way to answer as the worklet. */
class FakeNode {
	static last: FakeNode;
	posted: Posted[] = [];
	transfers: Transferable[][] = [];
	connected: unknown[] = [];
	disconnected = 0;
	port = {
		onmessage: null as ((e: { data: unknown }) => void) | null,
		postMessage: (m: Posted, transfer: Transferable[] = []) => {
			this.posted.push(m);
			this.transfers.push(transfer);
		},
	};
	constructor(
		public ctx: unknown,
		public name: string,
		public options: AudioWorkletNodeOptions,
	) {
		FakeNode.last = this;
	}
	connect(node: unknown) {
		this.connected.push(node);
		return node;
	}
	disconnect() {
		this.disconnected++;
	}
	say(data: unknown) {
		this.port.onmessage?.({ data });
	}
	feeds() {
		return this.posted.filter((m) => m.type === "feed");
	}
}

const ctxAt = (sampleRate: number) =>
	({
		sampleRate,
		audioWorklet: { addModule: vi.fn(() => Promise.resolve()) },
	}) as unknown as BaseAudioContext;

/** A read of a source whose sample k is k (per channel), recording each call. */
function source(frames: number, channels = 2) {
	const calls: [number, number][] = [];
	const read = vi.fn<StreamRead>(async (from, n) => {
		calls.push([from, n]);
		const len = Math.max(0, Math.min(n, frames - from));
		return Array.from({ length: channels }, () =>
			Float32Array.from({ length: len }, (_, k) => from + k),
		);
	});
	return { calls, read };
}
const settle = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
	vi.stubGlobal("AudioWorkletNode", FakeNode);
});
afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("StreamVoice", () => {
	it("installs the module once per context, and reports failure as false", async () => {
		const addModule = vi.fn(() => Promise.resolve());
		const ctx = { sampleRate: 48_000, audioWorklet: { addModule } } as unknown as BaseAudioContext;
		expect(await StreamVoice.install(ctx)).toBe(true);
		expect(await StreamVoice.install(ctx)).toBe(true);
		expect(addModule).toHaveBeenCalledTimes(1);
		expect(addModule).toHaveBeenCalledWith("/worklets/stream-voice.js");
		const refuse = vi.fn(() => Promise.reject(new Error("no")));
		const bad = {
			sampleRate: 48_000,
			audioWorklet: { addModule: refuse },
		} as unknown as BaseAudioContext;
		expect(await StreamVoice.install(bad)).toBe(false);
		expect(await StreamVoice.install({ sampleRate: 1 } as BaseAudioContext)).toBe(false);
	});
	it("chains connect to the destination, as an AudioNode does", () => {
		const v = new StreamVoice(ctxAt(48_000), {
			key: "k",
			sampleRate: 48_000,
			channels: 2,
			frames: 10,
			read: source(10).read,
		});
		const env = { connect: (n: unknown) => n } as unknown as AudioNode;
		expect(v.connect(env)).toBe(env);
		expect(FakeNode.last.connected).toEqual([env]);
		expect(FakeNode.last.options.outputChannelCount).toEqual([2]);
	});
	it("schedules, then pre-reads LEAD and one window from the offset, transferring each", async () => {
		const rate = 48_000;
		const { calls, read } = source(rate * 20);
		const v = new StreamVoice(ctxAt(rate), {
			key: "k",
			sampleRate: rate,
			channels: 2,
			frames: rate * 20,
			read,
		});
		v.start(10.5, 2, 8);
		await settle();
		const node = FakeNode.last;
		expect(node.posted[0]).toEqual({
			type: "schedule",
			startFrame: 504_000,
			frames: 384_000,
			channels: 2,
		});
		const win = STREAM_WINDOW_S * rate;
		expect(calls).toEqual(Array.from({ length: 7 }, (_, i) => [96_000 + i * win, win]));
		const feeds = node.feeds();
		expect(feeds.map((f) => f.fromFrame)).toEqual(calls.map((_, i) => i * win));
		expect(feeds[0]!.planes![0]![0]).toBe(96_000);
		expect(node.transfers[1]).toHaveLength(2);
		expect((STREAM_LEAD_S + STREAM_WINDOW_S) * rate).toBe(7 * win);
	});
	it("answers need with the next windows in order, never past the voice's end", async () => {
		const rate = 1000;
		const { calls, read } = source(5000, 1);
		const v = new StreamVoice(ctxAt(rate), {
			key: "k",
			sampleRate: rate,
			channels: 1,
			frames: 5000,
			read,
		});
		v.start(0, 0, 2.1);
		await settle();
		expect(calls).toHaveLength(7); // 1750 frames
		FakeNode.last.say({ type: "need", upto: 2100 });
		FakeNode.last.say({ type: "need", upto: 2100 }); // one pump at a time
		await settle();
		expect(calls.slice(7)).toEqual([
			[1750, 250],
			[2000, 100],
		]);
		const fed = FakeNode.last.feeds().reduce((n, f) => n + f.planes![0]!.length, 0);
		expect(fed).toBe(2100);
	});
	it("feeds the voice's frame count through the resampler when the rates differ", async () => {
		const { read } = source(44_100 * 4);
		const v = new StreamVoice(ctxAt(48_000), {
			key: "k",
			sampleRate: 44_100,
			channels: 2,
			frames: 44_100 * 4,
			read,
		});
		v.start(0, 0, 1);
		await settle();
		const feeds = FakeNode.last.feeds();
		const fed = feeds.reduce((n, f) => n + f.planes![0]!.length, 0);
		expect(fed).toBe(48_000);
		let at = 0;
		for (const f of feeds) {
			expect(f.fromFrame).toBe(at);
			at += f.planes![0]!.length;
		}
	});
	it("counts starved gaps and warns once", () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const v = new StreamVoice(ctxAt(1000), {
			key: "k",
			sampleRate: 1000,
			channels: 1,
			frames: 10,
			read: source(10, 1).read,
		});
		FakeNode.last.say({ type: "starved", frame: 3 });
		FakeNode.last.say({ type: "starved", frame: 9 });
		expect(v.starved).toBe(2);
		expect(warn).toHaveBeenCalledTimes(1);
	});
	it("warns once and stops feeding when a read comes back empty-handed", async () => {
		const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
		const read = vi.fn<StreamRead>(async () => null);
		const v = new StreamVoice(ctxAt(1000), {
			key: "k",
			sampleRate: 1000,
			channels: 1,
			frames: 9000,
			read,
		});
		v.start(0, 0, 9);
		await settle();
		FakeNode.last.say({ type: "need", upto: 4000 });
		await settle();
		expect(read).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledTimes(1);
		expect(FakeNode.last.feeds()).toHaveLength(0);
	});
	it("posts stop, then ends on the worklet's ended: onended once, disconnected", async () => {
		const v = new StreamVoice(ctxAt(1000), {
			key: "k",
			sampleRate: 1000,
			channels: 1,
			frames: 9000,
			read: source(9000, 1).read,
		});
		const ended = vi.fn();
		v.onended = ended;
		v.start(0, 0, 9);
		await settle();
		v.stop();
		expect(FakeNode.last.posted.at(-1)).toEqual({ type: "stop" });
		expect(ended).not.toHaveBeenCalled();
		FakeNode.last.say({ type: "ended" });
		FakeNode.last.say({ type: "ended" });
		expect(ended).toHaveBeenCalledTimes(1);
		expect(FakeNode.last.disconnected).toBe(1);
	});
	it("ends on its own when the worklet has played its frames", async () => {
		const v = new StreamVoice(ctxAt(1000), {
			key: "k",
			sampleRate: 1000,
			channels: 1,
			frames: 500,
			read: source(500, 1).read,
		});
		const ended = vi.fn();
		v.onended = ended;
		v.start(0);
		await settle();
		expect(FakeNode.last.posted[0]).toMatchObject({ type: "schedule", frames: 500 });
		FakeNode.last.say({ type: "ended" });
		expect(ended).toHaveBeenCalledTimes(1);
	});
});
