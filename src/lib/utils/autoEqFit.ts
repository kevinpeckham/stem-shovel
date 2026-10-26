import {
	AUTO_EQ_ALIGN_BANDS,
	AUTO_EQ_MAX_DB,
	AUTO_EQ_RUMBLE_DB,
	LIVE_TARGET_DB,
	SPECTRUM_BANDS,
} from "#lib/constants/autoEq.js";
import { EQ_BAND_SPECS, EQ_BANDS, type EqBand } from "#lib/constants/playbackEq.js";
import { DEFAULT_PLAYBACK_EQ, type PlaybackEqSettings } from "#lib/val/PlaybackEqSchema.js";
import { eqFreq, eqGain } from "./normalizePlaybackEq";

/** A band's share of a peak's gain `d` octaves from its center: all at the center, half an octave out, a fifth at two. */
const peakWeight = (d: number) => 1 / (1 + d * d);
/** A low shelf's share at `d` octaves above its corner (negative below): all an octave below, half at the corner, none an octave above. */
const lowShelfWeight = (d: number) => Math.min(1, Math.max(0, 0.5 - d / 2));

/** How much of a gain set on `band` at `center` reaches the octave at `f`. */
function weightAt(band: EqBand, center: number, f: number): number {
	const kind = EQ_BAND_SPECS[band].kind;
	const d = Math.log2(f / center);
	if (kind === "peaking") return peakWeight(Math.abs(d));
	return kind === "lowshelf" ? lowShelfWeight(d) : lowShelfWeight(-d);
}

/** The gap the recording shows against the target, per octave, once the two curves are aligned over the mid bands. */
function alignedResidual(spectrum: readonly number[]): number[] {
	const [a, b] = AUTO_EQ_ALIGN_BANDS;
	const mean = (xs: readonly number[]) =>
		xs.slice(a, b + 1).reduce((s, x) => s + x, 0) / (b + 1 - a);
	const offset = mean(LIVE_TARGET_DB) - mean(spectrum);
	// Positive where the recording is short of the target (a boost closes it), negative where it has too much.
	return SPECTRUM_BANDS.map((_, i) => LIVE_TARGET_DB[i] - (spectrum[i] + offset));
}

/** The gain `band` set at the octave `i` would want: the gap there for a peak, the weighted mean gap on its side for a shelf. */
function wantedGain(band: EqBand, i: number, residual: readonly number[]): number {
	if (EQ_BAND_SPECS[band].kind === "peaking") return residual[i];
	let sum = 0;
	let weight = 0;
	SPECTRUM_BANDS.forEach((g, j) => {
		const w = weightAt(band, SPECTRUM_BANDS[i], g);
		sum += w * residual[j];
		weight += w;
	});
	return weight ? sum / weight : 0;
}

/** The octave in the band's range where it would do the most, and how much. */
function bestOctave(band: EqBand, residual: readonly number[]): { f: number; gain: number } {
	const { minFreq, maxFreq } = EQ_BAND_SPECS[band];
	let best = { f: EQ_BAND_SPECS[band].defaultFreq, gain: 0 };
	SPECTRUM_BANDS.forEach((f, i) => {
		if (f < minFreq || f > maxFreq) return;
		const gain = wantedGain(band, i, residual);
		if (Math.abs(gain) > Math.abs(best.gain)) best = { f, gain };
	});
	return best;
}

interface Fit {
	gain: number;
	freq: number;
}

/** Moves `band` toward closing its widest gap (within the auto limit) and takes what it closed out of the residual. */
function fitBand(band: EqBand, fit: Fit, residual: number[]): void {
	const best = bestOctave(band, residual);
	if (Math.abs(best.gain) < 0.5) return;
	const next = Math.max(-AUTO_EQ_MAX_DB, Math.min(AUTO_EQ_MAX_DB, fit.gain + best.gain));
	const applied = next - fit.gain;
	if (applied === 0) return;
	fit.gain = next;
	fit.freq = best.f;
	SPECTRUM_BANDS.forEach((g, j) => {
		residual[j] -= applied * weightAt(band, best.f, g);
	});
}

/**
 * The playback EQ that brings a recording's measured octave-band spectrum
 * (`session_recording.spectrum`, dB per `SPECTRUM_BANDS`) toward
 * `LIVE_TARGET_DB`, the curve of a well-mixed live recording
 * (constants/autoEq.ts; docs/uploads-and-blob.md, "Auto EQ"). Both curves
 * are aligned over the mid bands first, so only the shape counts; the
 * gap is then closed band by band, each of the five taking the octave in
 * its range where the gap is widest (a shelf the mean gap on its side of
 * the corner), in two passes so the shelves and the peaks share the
 * work, with no band past `AUTO_EQ_MAX_DB`. A lowest octave well over
 * the target is rumble: the 80 Hz high-pass takes it instead of the low
 * shelf. A spectrum of the wrong shape gives the flat EQ.
 */
export function autoEqFit(spectrum: readonly number[]): PlaybackEqSettings {
	if (spectrum.length !== SPECTRUM_BANDS.length || spectrum.some((x) => !Number.isFinite(x)))
		return structuredClone(DEFAULT_PLAYBACK_EQ) as PlaybackEqSettings;
	const residual = alignedResidual(spectrum);
	const highPass = -residual[0] >= AUTO_EQ_RUMBLE_DB;
	if (highPass) {
		// The two-pole high-pass at 80 Hz takes the lowest octave and about 4 dB of the next.
		residual[0] = 0;
		residual[1] += 4;
	}
	const fits = Object.fromEntries(
		EQ_BANDS.map((band) => [band, { gain: 0, freq: EQ_BAND_SPECS[band].defaultFreq }]),
	) as Record<EqBand, Fit>;
	for (let pass = 0; pass < 2; pass++)
		for (const band of EQ_BANDS) fitBand(band, fits[band], residual);
	const settled = (band: EqBand) => ({
		gain: eqGain(fits[band].gain),
		freq: eqFreq(band, fits[band].freq),
	});
	return {
		highPass,
		low: settled("low"),
		lowMid: settled("lowMid"),
		mid: settled("mid"),
		highMid: settled("highMid"),
		high: settled("high"),
	};
}
