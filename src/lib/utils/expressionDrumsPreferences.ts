import * as v from "valibot";
import {
	ExpressionProjectSchema,
	type ExpressionProject,
} from "#lib/val/ExpressionDrumSchema.js";
import { tempoRatioOf, type TempoRatio } from "#lib/constants/tempo.js";

const KEY = "stemshovel.expression-drums";

export function loadExpressionDrumsPreferences(): ExpressionProject | null {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const json: unknown = JSON.parse(raw);
		const current = v.safeParse(ExpressionProjectSchema, json);
		return current.success ? current.output : null;
	} catch {
		return null;
	}
}

export function saveExpressionDrumsPreferences(p: ExpressionProject): void {
	try {
		localStorage.setItem(KEY, JSON.stringify(p));
	} catch {
		// Private mode or a full store: the project lasts for this page only.
	}
}

const TEMPO_KEY = "stemshovel.expression-drums.tempo";
export function loadExpressionDrumsTempoFollow(): { follow: boolean; ratio: TempoRatio } {
	try {
		const raw = localStorage.getItem(TEMPO_KEY);
		const json: unknown = raw ? JSON.parse(raw) : null;
		const o = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
		return { follow: o.follow !== false, ratio: tempoRatioOf(o.ratio) ?? 1 };
	} catch {
		return { follow: true, ratio: 1 };
	}
}
export function saveExpressionDrumsTempoFollow(v: { follow: boolean; ratio: TempoRatio }): void {
	try {
		localStorage.setItem(TEMPO_KEY, JSON.stringify(v));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}

const VOLUME_KEY = "stemshovel.expression-drums.volume";
export function loadExpressionDrumsVolume(): number {
	try {
		const val = Number(localStorage.getItem(VOLUME_KEY));
		return Number.isFinite(val) && localStorage.getItem(VOLUME_KEY) !== null
			? Math.min(1, Math.max(0, val))
			: 1;
	} catch {
		return 1;
	}
}
export function saveExpressionDrumsVolume(v: number): void {
	try {
		localStorage.setItem(VOLUME_KEY, String(v));
	} catch {
		// Private mode or a full store: the choice lasts for this page only.
	}
}
