import { PEAK_BINS } from "../audio/peaks";

/**
 * Waveform peaks from a stream of 16-bit little-endian PCM (ffmpeg's
 * `-f s16le`, mono), as the jobs function measures a demo or a session
 * recording after its MP3 renders (src/lib/server/transcode.ts): each
 * chunk of bytes is folded into coarse frames of `frameSamples` samples
 * (the loudest sample of each, in 0..1), and `finish` reduces the frames to
 * `bins` peaks over the whole length with the sample count, so the length
 * is known only at the end and the memory stays a few floats per frame
 * however long the file. A byte left over from an odd-sized chunk carries
 * into the next.
 */
export interface Pcm16Peaks {
	push(chunk: Uint8Array): void;
	finish(bins?: number): { peaks: number[]; samples: number };
}

export function createPcm16Peaks(frameSamples = 800): Pcm16Peaks {
	const frames: number[] = [];
	let acc = 0;
	let accSamples = 0;
	let samples = 0;
	let odd: number | null = null;
	return {
		push(chunk) {
			let i = 0;
			if (odd !== null && chunk.length > 0) {
				take((chunk[0]! << 8) | odd);
				odd = null;
				i = 1;
			}
			for (; i + 1 < chunk.length; i += 2) take((chunk[i + 1]! << 8) | chunk[i]!);
			odd = i < chunk.length ? chunk[i]! : null;
		},
		finish(bins = PEAK_BINS) {
			if (accSamples > 0) {
				frames.push(acc);
				acc = 0;
				accSamples = 0;
			}
			return { peaks: reducePeaks(frames, bins), samples };
		},
	};
	function take(word: number) {
		const v = Math.abs(word >= 0x8000 ? word - 0x10000 : word) / 0x8000;
		if (v > acc) acc = v;
		samples++;
		if (++accSamples === frameSamples) {
			frames.push(acc);
			acc = 0;
			accSamples = 0;
		}
	}
}

/** `bins` peaks over a longer run of peaks: the loudest of each bin's share; a shorter run is stretched. */
export function reducePeaks(frames: number[], bins: number): number[] {
	const out: number[] = Array.from({ length: bins }, () => 0);
	if (frames.length === 0) return out;
	for (let bin = 0; bin < bins; bin++) {
		const start = Math.floor((bin * frames.length) / bins);
		const end = Math.max(start + 1, Math.floor(((bin + 1) * frames.length) / bins));
		let max = 0;
		for (let i = start; i < end && i < frames.length; i++) if (frames[i]! > max) max = frames[i]!;
		out[bin] = Math.min(1, max);
	}
	return out;
}
