/**
 * The tempo of a recording, from its onsets (docs/dawn-daw-plan.md, D5):
 * the energy per 10 ms frame, its rises (a half-wave rectified difference,
 * the onset strength), then the autocorrelation of that curve over lags
 * from 240 down to 40 bpm; the strongest lag wins, with a preference for
 * the 70–180 bpm range where a doubled or halved reading is folded into
 * it. Null for silence or anything shorter than a few seconds. Pure, over
 * channel data; the clip bar's "Detect tempo" hands the result to the
 * song's tempo.
 */
export function detectTempo(
	channels: Float32Array[],
	sampleRate: number,
	range = { min: 40, max: 240 },
): number | null {
	const n = channels[0]?.length ?? 0;
	if (channels.length === 0 || n < sampleRate * 3) return null;
	const hop = Math.round(sampleRate / 100);
	const frames = Math.floor(n / hop);
	const energy = new Float32Array(frames);
	for (let f = 0; f < frames; f++) {
		let sum = 0;
		const a = f * hop;
		for (const ch of channels) for (let i = a; i < a + hop; i++) sum += ch[i]! * ch[i]!;
		energy[f] = Math.sqrt(sum / (hop * channels.length));
	}
	let total = 0;
	for (const e of energy) total += e;
	if (total / frames < 1e-4) return null;
	// The onset strength: how much louder each frame is than the one before, in a compressed scale.
	const onset = new Float32Array(frames);
	for (let f = 1; f < frames; f++)
		onset[f] = Math.max(0, Math.log1p(energy[f]! * 50) - Math.log1p(energy[f - 1]! * 50));
	let mean = 0;
	for (const v of onset) mean += v;
	mean /= frames;
	for (let f = 0; f < frames; f++) onset[f] = onset[f]! - mean;
	const minLag = Math.round(6000 / range.max);
	const maxLag = Math.round(6000 / range.min);
	const raw = new Map<number, number>();
	for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
		let acc = 0;
		for (let f = lag; f < frames; f++) acc += onset[f]! * onset[f - lag]!;
		raw.set(lag, acc / (frames - lag));
	}
	// A period that is not a whole number of frames spreads over two lags: each lag scores with its neighbors.
	const score = (lag: number) =>
		(raw.get(lag - 1) ?? 0) + (raw.get(lag) ?? 0) + (raw.get(lag + 1) ?? 0);
	let bestLag = 0;
	let best = -Infinity;
	for (let lag = minLag; lag <= maxLag; lag++) {
		const v = score(lag);
		if (v > best) {
			best = v;
			bestLag = lag;
		}
	}
	if (!(best > 0) || !bestLag) return null;
	// The period to a fraction of a frame: the neighbors' weight pulls it between lags.
	const refined = (lag: number) => {
		let num = 0;
		let den = 0;
		for (const k of [lag - 1, lag, lag + 1]) {
			const v = Math.max(0, raw.get(k) ?? 0);
			num += k * v;
			den += v;
		}
		return den > 0 ? num / den : lag;
	};
	let lag = refined(bestLag);
	// Fold a reading outside the comfortable range toward it when the folded lag scores nearly as well.
	const folded = (factor: number) => {
		const center = Math.round(bestLag * factor);
		return score(center) >= best * 0.6 ? refined(center) : null;
	};
	if (6000 / lag > 180) lag = folded(2) ?? lag;
	else if (6000 / lag < 70) lag = folded(0.5) ?? lag;
	const bpm = 6000 / lag;
	return Math.round(bpm * 10) / 10;
}
