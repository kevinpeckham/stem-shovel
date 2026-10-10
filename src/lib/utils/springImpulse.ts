/**
 * A spring reverb's impulse response, synthesized (docs/practice-amp.md,
 * "The spring"): a spring is dispersive, so a click comes back as a train
 * of chirps (each echo's high frequencies arrive first and the low ones
 * after, the "boing"), repeating every 28 ms or so and dying over a
 * second and a half, with a diffuse tail under them. Two channels with
 * their own jitter, so the stereo tank is wider than a mono one. Scaled
 * so the loudest echo peaks at 0.5; a wet gain sets the level.
 */
const ECHO_SECONDS = 0.028;
const CHIRP_SECONDS = 0.006;
const CHIRP_FROM_HZ = 3500;
const CHIRP_TO_HZ = 300;
const DECAY_SECONDS = 0.55;

/** A small deterministic generator, so a render is the same every time. */
function random(seed: number) {
	let s = seed >>> 0;
	return () => {
		s = (s * 1664525 + 1013904223) >>> 0;
		return s / 4294967296;
	};
}

export function springImpulseSamples(
	rate: number,
	seconds = 1.8,
): [Float32Array<ArrayBuffer>, Float32Array<ArrayBuffer>] {
	const n = Math.round(seconds * rate);
	const channels: Float32Array<ArrayBuffer>[] = [];
	for (let ch = 0; ch < 2; ch++) {
		const rnd = random(11 + ch * 7);
		const out = new Float32Array(n);
		const chirpLength = Math.round(CHIRP_SECONDS * rate);
		for (let k = 1; k * ECHO_SECONDS < seconds; k++) {
			const t = k * ECHO_SECONDS * (1 + (rnd() - 0.5) * 0.08);
			const start = Math.round(t * rate);
			const level = Math.exp(-t / DECAY_SECONDS) * (0.7 + rnd() * 0.3);
			let phase = 0;
			for (let i = 0; i < chirpLength && start + i < n; i++) {
				const u = i / chirpLength;
				const hz = CHIRP_FROM_HZ * (CHIRP_TO_HZ / CHIRP_FROM_HZ) ** u;
				phase += (2 * Math.PI * hz) / rate;
				const env = Math.sin(Math.PI * u);
				out[start + i]! += level * env * Math.sin(phase);
			}
		}
		// The diffuse tail: darkening noise, 12 dB under the echoes.
		let low = 0;
		for (let i = 0; i < n; i++) {
			const t = i / rate;
			const white = rnd() * 2 - 1;
			low += (white - low) * 0.12;
			out[i]! += 0.25 * low * Math.exp(-t / DECAY_SECONDS) * Math.min(1, t / 0.03);
		}
		let peak = 0;
		for (const x of out) peak = Math.max(peak, Math.abs(x));
		if (peak > 0) for (let i = 0; i < n; i++) out[i]! *= 0.5 / peak;
		channels.push(out);
	}
	return [channels[0]!, channels[1]!];
}
