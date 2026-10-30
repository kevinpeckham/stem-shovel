import type { ChartBar } from "#lib/utils/chartBars.js";
import type { AlignChartReply, AlignChartRequest } from "#lib/workers/alignChart.worker.js";
import type { Alignment } from "./chartAlignment.js";

/**
 * A chart aligned to a song's decoded audio in a worker
 * (workers/alignChart.worker.ts): the buffers (a mix, or every stem) are
 * summed to one mono track at the first buffer's rate, channels averaged,
 * as long as the longest, a buffer at another rate resampled linearly on
 * the way in. A worker per call, ended when it answers or after 90 s.
 * Never throws: no Worker, a failure in it, or the timeout rejects with a
 * sentence the page can show.
 */
const TIMEOUT_MS = 90_000;

/** One buffer's channels averaged and added into `out` (at `rate`), resampled by linear interpolation when its own rate differs. */
function addMono(out: Float32Array, buffer: AudioBuffer, rate: number): void {
	const channels = Array.from({ length: buffer.numberOfChannels }, (_, c) =>
		buffer.getChannelData(c),
	);
	const step = buffer.sampleRate / rate;
	const scale = 1 / Math.max(1, channels.length);
	const frames = Math.min(out.length, Math.floor((buffer.length - 1) / step) + 1);
	for (let i = 0; i < frames; i++) {
		const x = i * step;
		const k = Math.floor(x);
		const t = x - k;
		for (const data of channels)
			out[i]! += (data[k]! + t * ((data[k + 1] ?? data[k]!) - data[k]!)) * scale;
	}
}

function mono(buffers: AudioBuffer[]): { samples: Float32Array; sampleRate: number } {
	const sampleRate = buffers[0]!.sampleRate;
	const length = Math.max(...buffers.map((b) => Math.ceil((b.length * sampleRate) / b.sampleRate)));
	const samples = new Float32Array(length);
	for (const buffer of buffers) addMono(samples, buffer, sampleRate);
	return { samples, sampleRate };
}

export async function alignChartInBrowser(
	bars: ChartBar[],
	buffers: AudioBuffer[],
): Promise<Alignment> {
	if (typeof Worker === "undefined") throw new Error("This browser cannot align the chart");
	if (buffers.length === 0) throw new Error("There is no audio to align the chart to");
	const { samples, sampleRate } = mono(buffers);
	const worker = new Worker(new URL("../workers/alignChart.worker.ts", import.meta.url), {
		type: "module",
	});
	try {
		return await new Promise<Alignment>((resolve, reject) => {
			const timer = setTimeout(
				() => reject(new Error("Aligning the chart took too long")),
				TIMEOUT_MS,
			);
			worker.onmessage = (e: MessageEvent<AlignChartReply>) => {
				clearTimeout(timer);
				if ("error" in e.data) reject(new Error(e.data.error));
				else resolve(e.data.alignment);
			};
			worker.onerror = () => {
				clearTimeout(timer);
				reject(new Error("Aligning the chart failed in the browser"));
			};
			const request: AlignChartRequest = {
				id: 1,
				bars: bars.map(({ chords, bpm, meter }) => ({ chords, bpm, meter })),
				recording: samples,
				sampleRate,
			};
			worker.postMessage(request, [samples.buffer]);
		});
	} finally {
		worker.terminate();
	}
}
