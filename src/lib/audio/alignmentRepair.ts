import {
	COMB_COARSE_STEP_FRACTION,
	COMB_FINE_STEP_FRACTION,
	COMB_PHASE_STEP_SEC,
	COMB_RANGE_FRACTION,
	REPAIR_MIN_TRUSTED_SHARE,
	REPAIR_SLIDE_FRACTION,
	REPAIR_SLIDE_STEP_SEC,
	REPAIR_TRUST_FRACTION,
	REPHASE_FENCE_BEATS,
} from "#lib/constants/chartAlignment.js";
import { detrend } from "./analysis.js";

/**
 * The chart alignment's end repair (stem-bench Study 26c, recipe v3,
 * ported from the bench's `study26/recipe.ts` and `study24/tempo.ts`).
 * The warping places the middle of a song well and its ends badly (Letter
 * Lands: bar 1 at 8 s, half-length bars at the head, the end 15 s early),
 * because the chart stops describing the intro and the outro. The repair
 * keeps the path and the same-piece gates as they are and rebuilds only
 * the ends: the bar's length from an onset comb near the declared bar, the
 * phase from the middle's bar starts, the run of bar starts that sit on
 * that lattice trusted, and the bars outside it extrapolated at the comb's
 * period and slid, each end as one, onto the recording's onsets within a
 * quarter bar. On the bench: Letter Lands' first and last bars to 0.05 and
 * 0.02 s, Peaceful Dreams' to 0.06 and 0.11 s. Pure arithmetic.
 *
 * The grid re-phase (stem-bench Study 27, recipe v5, `rephaseGrid`) keeps
 * v3's phase line and trust machinery and replaces the end repair: at fast
 * tempos the warping's middle carries a coherent whole-grid phase offset
 * (Mop Heart, 224 bpm in 3/4: 0.42 s), and the onset lattice, not the
 * path's phase, is where the notes are, so the whole uniform line slides
 * once onto the onsets, fenced at half a beat. `repairEnds` stays as the
 * bench's v3 reference.
 */

/** A lattice found by the comb: its period and phase in seconds and the objective there. */
export interface CombFit {
	period: number;
	phase: number;
	score: number;
}

export interface EndRepair {
	/** The repaired bar starts, as many as went in. */
	barStarts: number[];
	/** Per bar start: on the trusted span (the path's own), or extrapolated from it. */
	confidence: ("aligned" | "extrapolated")[];
	/** The bar in seconds the ends were extrapolated at (the comb's). */
	period: number;
	/** The trusted span's first and last index. */
	iFirst: number;
	iLast: number;
	/** Seconds each end slid onto the onsets. */
	slides: { intro: number; outro: number };
}

export interface GridRephase {
	/** The re-phased bar starts, as many as went in: the uniform line slid by `delta`. */
	barStarts: number[];
	/** Per bar start: the path's own start agrees within a quarter bar ("aligned"), or not ("re-phased"). */
	confidence: ("aligned" | "re-phased")[];
	/** The bar in seconds the line runs at (the comb's). */
	period: number;
	/** Seconds the whole line slid onto the onsets, within ±`REPHASE_FENCE_BEATS` beat. */
	delta: number;
	/** The trusted span's first and last index. */
	iFirst: number;
	iLast: number;
}

/** The best phase and its mean detrended onset energy, for one candidate period. */
function phaseScore(
	x: Float32Array,
	fps: number,
	period: number,
): { phase: number; score: number } {
	const duration = x.length / fps;
	let bestPhase = 0;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (let phase = 0; phase < period; phase += COMB_PHASE_STEP_SEC) {
		let sum = 0;
		let count = 0;
		for (let t = phase; t < duration; t += period) {
			const frame = Math.round(t * fps);
			if (frame < x.length) {
				sum += x[frame]!;
				count++;
			}
		}
		const score = count > 0 ? sum / count : Number.NEGATIVE_INFINITY;
		if (score > bestScore) {
			bestScore = score;
			bestPhase = phase;
		}
	}
	return { phase: bestPhase, score: bestScore };
}

/** The best of `periods` (the first on a tie), each with its best phase. */
function scanPeriods(
	periods: number[],
	evaluate: (period: number) => { phase: number; score: number },
): CombFit {
	let best: CombFit | null = null;
	for (const period of periods) {
		const { phase, score } = evaluate(period);
		if (best === null || score > best.score) best = { period, phase, score };
	}
	if (!best) throw new Error("empty period scan");
	return best;
}

function periodLadder(center: number, halfRange: number, step: number): number[] {
	const out: number[] = [];
	for (let p = center - halfRange; p <= center + halfRange + 1e-9; p += step) out.push(p);
	return out;
}

/**
 * The onset comb (stem-bench Study 24's P2): the period within ±10 % of
 * the declared bar, and its phase, whose lattice lands on the most
 * detrended onset energy on average; a coarse scan, then a fine one
 * around its best.
 */
export function jointOnsetComb(onset: Float32Array, fps: number, declaredPeriod: number): CombFit {
	const x = detrend(onset, fps);
	const evaluate = (period: number) => phaseScore(x, fps, period);
	const coarse = scanPeriods(
		periodLadder(
			declaredPeriod,
			declaredPeriod * COMB_RANGE_FRACTION,
			declaredPeriod * COMB_COARSE_STEP_FRACTION,
		),
		evaluate,
	);
	return scanPeriods(
		periodLadder(
			coarse.period,
			declaredPeriod * COMB_COARSE_STEP_FRACTION,
			declaredPeriod * COMB_FINE_STEP_FRACTION,
		),
		evaluate,
	);
}

/**
 * The run of bar starts that sit on the lattice `predict` (within a
 * quarter bar): `iFirst` opens the first run of four trusted starts,
 * `iLast` closes the last; null when there is no such run.
 */
export function trustedSpan(
	ts: number[],
	period: number,
	predict: (i: number) => number,
): { iFirst: number; iLast: number } | null {
	const tol = REPAIR_TRUST_FRACTION * period;
	const trusted = ts.map((t, i) => Math.abs(t - predict(i)) <= tol);
	const run = (i: number) => trusted[i]! && trusted[i + 1]! && trusted[i + 2]! && trusted[i + 3]!;
	let iFirst = -1;
	for (let i = 0; i + 3 < trusted.length; i++) {
		if (run(i)) {
			iFirst = i;
			break;
		}
	}
	let iLast = -1;
	for (let i = trusted.length - 1; i >= 3; i--) {
		if (run(i - 3)) {
			iLast = i;
			break;
		}
	}
	if (iFirst < 0 || iLast < iFirst) return null;
	return { iFirst, iLast };
}

/** The shift within ±`range` seconds, in 10 ms steps, that puts `times` on the most detrended onset energy on average. */
export function combSlide(
	onset: Float32Array,
	fps: number,
	times: number[],
	range: number,
): number {
	const x = detrend(onset, fps);
	let best = 0;
	let bestScore = Number.NEGATIVE_INFINITY;
	for (let d = -range; d <= range + 1e-9; d += REPAIR_SLIDE_STEP_SEC) {
		let sum = 0;
		let count = 0;
		for (const t of times) {
			const f = Math.round((t + d) * fps);
			if (f >= 0 && f < x.length) {
				sum += x[f]!;
				count++;
			}
		}
		const score = count > 0 ? sum / count : Number.NEGATIVE_INFINITY;
		if (score > bestScore) {
			bestScore = score;
			best = d;
		}
	}
	return best;
}

/**
 * The phase line through an alignment's bar starts `ts` at `period`: the
 * phase the median residual of the middle 60 % of starts, and the trusted
 * span on that line. Null, the refusal, when the span covers under half
 * of the starts: the chart's bars do not line up with the recording's
 * middle (on the bench, a wrong chart).
 */
function phaseLine(
	ts: number[],
	period: number,
): { phase: number; iFirst: number; iLast: number } | null {
	const n = ts.length;
	const lo = Math.floor(0.2 * n);
	const hi = Math.max(lo + 2, Math.ceil(0.8 * n));
	const residuals = ts
		.slice(lo, hi)
		.map((t, j) => t - (lo + j) * period)
		.sort((a, b) => a - b);
	const phase = residuals[Math.floor(residuals.length / 2)]!;
	const span = trustedSpan(ts, period, (i) => phase + i * period);
	if (!span || span.iLast - span.iFirst + 1 < REPAIR_MIN_TRUSTED_SHARE * n) return null;
	return { phase, ...span };
}

/**
 * The ends of an alignment's bar starts `ts` rebuilt (Study 26c's recipe
 * v3): the phase is the median residual of the middle 60 % of starts
 * against a lattice at `period` (the comb's), the trusted span the run on
 * that lattice, and the starts before and after it extrapolated at
 * `period` from its first and last, each end slid onto the onsets within
 * ±0.25 bar. Null, the refusal, when the trusted span covers under half
 * of the starts: the chart's bars do not line up with the recording's
 * middle (on the bench, a wrong chart).
 */
export function repairEnds(
	ts: number[],
	onset: Float32Array,
	fps: number,
	period: number,
): EndRepair | null {
	const line = phaseLine(ts, period);
	if (!line) return null;
	const n = ts.length;
	const { iFirst, iLast } = line;
	const intro = Array.from({ length: iFirst }, (_, k) => ts[iFirst]! - (iFirst - k) * period);
	const outro = Array.from({ length: n - 1 - iLast }, (_, j) => ts[iLast]! + (j + 1) * period);
	const reach = REPAIR_SLIDE_FRACTION * period;
	const introSlide = intro.length > 0 ? combSlide(onset, fps, intro, reach) : 0;
	const outroSlide = outro.length > 0 ? combSlide(onset, fps, outro, reach) : 0;
	const barStarts = [
		...intro.map((t) => t + introSlide),
		...ts.slice(iFirst, iLast + 1),
		...outro.map((t) => t + outroSlide),
	];
	const confidence = barStarts.map((_, i) =>
		i >= iFirst && i <= iLast ? ("aligned" as const) : ("extrapolated" as const),
	);
	return {
		barStarts,
		confidence,
		period,
		iFirst,
		iLast,
		slides: { intro: introSlide, outro: outroSlide },
	};
}

/**
 * An alignment's bar starts `ts` re-phased (stem-bench Study 27's recipe
 * v5): v3's phase line and trusted span (`phaseLine`), then the whole
 * uniform line at `period` slid once onto the onsets, fenced at
 * ±`REPHASE_FENCE_BEATS` of a beat (`period / beatsPerBar`) so it fixes a
 * sub-beat phase and never hops a beat. Every start ships on the slid
 * line; one is "aligned" where the path's own start agrees within a
 * quarter bar, else "re-phased". Null, the same refusal as `repairEnds`.
 */
export function rephaseGrid(
	ts: number[],
	onset: Float32Array,
	fps: number,
	period: number,
	beatsPerBar: number,
): GridRephase | null {
	const fit = phaseLine(ts, period);
	if (!fit) return null;
	const line = ts.map((_, i) => fit.phase + i * period);
	const delta = combSlide(onset, fps, line, REPHASE_FENCE_BEATS * (period / beatsPerBar));
	const barStarts = line.map((t) => t + delta);
	const tol = REPAIR_TRUST_FRACTION * period;
	const confidence = barStarts.map((t, i) =>
		Math.abs(ts[i]! - t) <= tol ? ("aligned" as const) : ("re-phased" as const),
	);
	return { barStarts, confidence, period, delta, iFirst: fit.iFirst, iLast: fit.iLast };
}
