import {
	AudioSample,
	AudioSampleSource,
	BufferTarget,
	Mp3OutputFormat,
	Output,
	Quality,
} from "mediabunny";

/**
 * Float32 channels as an MP3, in the browser: mediabunny's `Output` with
 * `Mp3OutputFormat` over `@mediabunny/mp3-encoder` (LAME 3.100 in WASM,
 * run in a worker the extension spawns from a blob URL; its code and WASM
 * are inlined in the module). The extension is imported on first use, so
 * it stays out of the page's initial bundle, and registered once; it is
 * registered without checking for a native MP3 encoder (browsers have
 * none in WebCodecs today, and LAME at a constant bitrate is the same file
 * everywhere). The bitrate is in bits per second (192 kbps by default)
 * and snaps to the MPEG-1 Layer III constant bitrates. Mono or stereo
 * input; more channels are mixed down to two, and a sample rate MP3 does
 * not carry (96 kHz, say) is resampled to 48 kHz. Browser only: nothing on
 * the server imports this.
 */
export type EncodeMp3Options = {
	/** Bits per second; snapped to the nearest MP3 constant bitrate. 192 000 by default. */
	bitrate?: number;
};

/** The MPEG-1/2 Layer III constant bitrates, in kbps. */
const BITRATES_KBPS = [
	8, 16, 24, 32, 40, 48, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
] as const;
/** The sample rates MPEG-1, MPEG-2 and MPEG-2.5 Layer III carry. */
const SAMPLE_RATES = [48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000];
/** Frames handed to the encoder at a time: five seconds of 48 kHz mono, split across the channels. */
const CHUNK_FLOATS = 48000 * 5;

let registration: Promise<void> | null = null;

/** Loads the LAME extension once and registers it with mediabunny. */
const registerEncoder = () =>
	(registration ??= import("@mediabunny/mp3-encoder").then((m) => m.registerMp3Encoder()));

const nearestBitrate = (bps: number) => {
	const kbps = bps / 1000;
	return (
		BITRATES_KBPS.reduce((best, b) => (Math.abs(b - kbps) < Math.abs(best - kbps) ? b : best)) *
		1000
	);
};

export async function encodeMp3(
	channels: Float32Array[],
	sampleRate: number,
	opts: EncodeMp3Options = {},
): Promise<Blob> {
	if (channels.length === 0) throw new Error("encodeMp3 needs at least one channel");
	await registerEncoder();
	const numberOfChannels = channels.length;
	const transform = {
		...(numberOfChannels > 2 ? { numberOfChannels: 2 } : {}),
		...(SAMPLE_RATES.includes(sampleRate) ? {} : { sampleRate: 48000 }),
	};
	const output = new Output({ format: new Mp3OutputFormat(), target: new BufferTarget() });
	const source = new AudioSampleSource({
		codec: "mp3",
		quality: new Quality({
			bitrate: nearestBitrate(opts.bitrate ?? 192_000),
			bitrateMode: "constant",
		}),
		transform,
	});
	output.addAudioTrack(source);
	await output.start();
	const frames = channels[0]!.length;
	const chunk = Math.max(1, Math.floor(CHUNK_FLOATS / numberOfChannels));
	for (let at = 0; at < frames; at += chunk) {
		const n = Math.min(chunk, frames - at);
		const data = new Float32Array(numberOfChannels * n);
		channels.forEach((ch, c) => data.set(ch.subarray(at, at + n), c * n));
		await source.add(
			new AudioSample({
				format: "f32-planar",
				numberOfChannels,
				sampleRate,
				timestamp: at / sampleRate,
				data,
			}),
		);
	}
	source.close();
	await output.finalize();
	return new Blob([output.target.buffer!], { type: "audio/mpeg" });
}
